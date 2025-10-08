import isEmpty from "lodash.isempty";
import { isDeepStrictEqual as isEqual } from "node:util";
import { RequestError } from "@octokit/request-error";

export enum Section {
    Prod,
    Dev,
}

interface LockedPackage {
    version: string;
    source: PackageSource;
}

interface PackageSource {
    type: string;
    url: string;
    reference: string;
}

export enum Operation {
    Added = 1,
    Removed = 2,
    Updated = 4,
    Moved = 8, // Moved from dev->prod or prod->dev
}

export interface ComposerDiff {
    manifest: ManifestDiff;
    lock: LockDiff;
}

interface ManifestDiffEntry {
    name: string;
    operation: Operation;
    section: Section; // The most recent section the dependency is in.
    base: string | null; // Constraint
    head: string | null; // Constraint
}

class ManifestDiff extends Map<string, ManifestDiffEntry> {}

interface LockDiffEntry {
    name: string;
    operation: Operation;
    section: Section;
    direct: boolean;
    base: LockedPackage | null;
    head: LockedPackage | null;
    link: string | null;
}

class LockDiff extends Map<string, LockDiffEntry> {}

// interface LockDiff {
//     prod: Array<LockDiffEntry>,
//     dev: Array<LockDiffEntry>,
// }

export class Diff {
    private octokit: any;

    constructor(octokit: any) {
        this.octokit = octokit;
    }

    async generate(
        owner: string,
        repo: string,
        baseRef: string,
        headRef: string,
        path: string
    ): Promise<ComposerDiff> {
        return Promise.all([
            this.diffManifest(owner, repo, baseRef, headRef, path),
            this.diffLock(
                owner,
                repo,
                baseRef,
                headRef,
                path.replace(/\.json$/, ".lock")
            ),
        ]).then((result) => {
            for (const i of result[1].values()) {
                i.direct = result[0].has(i.name);
            }

            return {
                manifest: result[0],
                lock: result[1],
            };
        });
    }

    private diffManifest(
        owner: string,
        repo: string,
        baseRef: string,
        headRef: string,
        path: string
    ): Promise<ManifestDiff> {
        const base = this.octokit.rest.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: baseRef,
            mediaType: {
                format: "raw",
            },
        }).catch(handle404);

        const head = this.octokit.rest.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: headRef,
            mediaType: {
                format: "raw",
            },
        }).catch(handle404);

        return Promise.all([base, head]).then((result: any) => {
            const base = result[0].data.trim();
            const head = result[1].data.trim();

            const baseObj = JSON.parse(base);
            const headObj = JSON.parse(head);

            if (isEmpty(baseObj) && isEmpty(headObj)) {
                throw new Error(`${path} was empty on both references (or repository, ${owner}/${repo}, does not exist)`);
            }

            if (base === head) {
                return new ManifestDiff();
            }

            const changes = this.parseManifestChanges(
                baseObj,
                headObj,
                "require"
            );

            for (const diff of this.parseManifestChanges(
                baseObj,
                headObj,
                "require-dev"
            ).values()) {
                const prodDiff = changes.get(diff.name);

                if (prodDiff) {
                    // Change for the same package exists already.
                    const baseConstraint =
                        diff.operation === Operation.Added
                            ? prodDiff.base
                            : diff.base;
                    const headConstraint =
                        diff.operation === Operation.Added
                            ? diff.head
                            : prodDiff.head;

                    changes.set(diff.name, {
                        name: diff.name,
                        operation:
                            Operation.Moved |
                            (baseConstraint !== headConstraint
                                ? Operation.Updated
                                : 0),
                        section:
                            diff.operation === Operation.Added
                                ? Section.Dev
                                : Section.Prod,
                        base: baseConstraint,
                        head: headConstraint,
                    });
                } else {
                    changes.set(diff.name, diff);
                }
            }

            return changes;
        });
    }

    private parseManifestChanges(
        baseObj: any,
        headObj: any,
        section: string
    ): ManifestDiff {
        const changes = new ManifestDiff();

        for (const [basePackage, baseConstraint] of Object.entries<string>(
            baseObj[section] || {}
        )) {
            if (headObj[section] && headObj[section][basePackage]) {
                if (headObj[section][basePackage] !== baseConstraint) {
                    changes.set(basePackage, {
                        name: basePackage,
                        operation: Operation.Updated,
                        section:
                            section === "require" ? Section.Prod : Section.Dev,
                        base: baseConstraint,
                        head: <string>headObj[section][basePackage],
                    });
                }
            } else {
                changes.set(basePackage, {
                    name: basePackage,
                    operation: Operation.Removed,
                    section: section === "require" ? Section.Prod : Section.Dev,
                    base: baseConstraint,
                    head: null,
                });
            }
        }

        for (const [headPackage, headConstraint] of Object.entries<string>(
            headObj[section] || {}
        )) {
            if (!baseObj[section] || !baseObj[section][headPackage]) {
                changes.set(headPackage, {
                    name: headPackage,
                    operation: Operation.Added,
                    section: section === "require" ? Section.Prod : Section.Dev,
                    base: null,
                    head: headConstraint,
                });
            }
        }

        return changes;
    }

    private diffLock(
        owner: string,
        repo: string,
        baseRef: string,
        headRef: string,
        path: string
    ): Promise<LockDiff> {
        const base = this.octokit.rest.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: baseRef,
            mediaType: {
                format: "raw",
            },
        }).catch(handle404);

        const head = this.octokit.rest.repos.getContent({
            owner: owner,
            repo: repo,
            path: path,
            ref: headRef,
            mediaType: {
                format: "raw",
            },
        }).catch(handle404);

        return Promise.all([base, head]).then((result: any) => {
            const base = result[0].data.trim();
            const head = result[1].data.trim();

            if (base === head) {
                return new LockDiff();
            }

            const baseObj = JSON.parse(base);
            const headObj = JSON.parse(head);

            const changes = this.parseLockChanges(baseObj, headObj, "packages");

            for (const diff of this.parseLockChanges(
                baseObj,
                headObj,
                "packages-dev"
            ).values()) {
                const prodDiff = changes.get(diff.name);

                if (prodDiff) {
                    // Change for the same package exists already.
                    const basePackage =
                        diff.operation === Operation.Added
                            ? prodDiff.base
                            : diff.base;
                    const headPackage =
                        diff.operation === Operation.Added
                            ? diff.head
                            : prodDiff.head;
                    const operation =
                        Operation.Moved |
                        (isEqual(basePackage, headPackage)
                            ? 0
                            : Operation.Updated);

                    changes.set(diff.name, {
                        name: diff.name,
                        operation: operation,
                        section:
                            diff.operation === Operation.Added
                                ? Section.Dev
                                : Section.Prod,
                        direct: false,
                        base: basePackage,
                        head: headPackage,
                        link:
                            operation & Operation.Updated
                                ? generateOnlineDiffLink(
                                      basePackage!.source,
                                      headPackage!.source
                                  )
                                : null,
                    });
                } else {
                    changes.set(diff.name, diff);
                }
            }

            return changes;
        });
    }

    private parseLockChanges(
        baseObj: any,
        headObj: any,
        section: string
    ): LockDiff {
        const changes = new LockDiff();
        const basePackages = new Map<string, any>();
        const headPackages = new Map<string, any>();

        (baseObj[section] || []).forEach((pkg: any) => {
            basePackages.set(pkg.name, pkg);
        });

        (headObj[section] || []).forEach((pkg: any) => {
            headPackages.set(pkg.name, pkg);
        });

        for (const basePkg of basePackages.values()) {
            const headPkg = headPackages.get(basePkg.name);

            if (headPkg) {
                if (basePkg.version !== headPkg.version) {
                    changes.set(basePkg.name, {
                        name: basePkg.name,
                        section:
                            section === "packages" ? Section.Prod : Section.Dev,
                        operation: Operation.Updated,
                        direct: false,
                        base: {
                            version: basePkg.version,
                            source: <PackageSource>basePkg.source,
                        },
                        head: {
                            version: headPkg.version,
                            source: <PackageSource>headPkg.source,
                        },
                        link: generateOnlineDiffLink(
                            <PackageSource>basePkg.source,
                            <PackageSource>headPkg.source
                        ),
                    });
                }
            } else {
                changes.set(basePkg.name, {
                    name: basePkg.name,
                    section:
                        section === "packages" ? Section.Prod : Section.Dev,
                    operation: Operation.Removed,
                    direct: false,
                    base: {
                        version: basePkg.version,
                        source: <PackageSource>basePkg.source,
                    },
                    head: null,
                    link: null,
                });
            }
        }

        for (const headPkg of headPackages.values()) {
            if (!basePackages.has(headPkg.name)) {
                changes.set(headPkg.name, {
                    name: headPkg.name,
                    section:
                        section === "packages" ? Section.Prod : Section.Dev,
                    operation: Operation.Added,
                    direct: false,
                    base: null,
                    head: {
                        version: headPkg.version,
                        source: <PackageSource>headPkg.source,
                    },
                    link: null,
                });
            }
        }

        return changes;
    }
}

function generateOnlineDiffLink(
    a: PackageSource,
    b: PackageSource
): string | null {
    if (a === b) {
        return null;
    }

    if (a.type === "git" && b.type === "git") {
        if (
            parseGitHubUrl(a.url) &&
            parseGitHubUrl(a.url) === parseGitHubUrl(b.url)
        ) {
            return `https://github.com/${parseGitHubUrl(a.url)}/compare/${
                a.reference
            }...${b.reference}`;
        }
    }

    return null;
}

/**
 * Extract GitHub owner/repo string from a URL.
 */
function parseGitHubUrl(url: string): string | null {
    const regex = /^(?:https?|git):\/\/github.com\/([^/]+?\/[^/]+?)(?:\.git)?$/;
    const result = url.match(regex);

    if (result) {
        return result[1];
    }

    return null;
}

/**
 * Convert 404 response into empty JSON document.
 */
function handle404(error: RequestError) {
    if (error.status === 404) {
        return new Promise((resolve) => {
            resolve({data: "{}"});
        });
    }

    throw error;
}
