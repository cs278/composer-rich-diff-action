import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { Diff, Section, Operation } from "./diff";
import { render } from "./markdownRenderer";

type GithubContext = typeof context;

async function run(): Promise<void> {
    try {
        const octokit = getOctokit(core.getInput("token"));
        const composerJson = core.getInput("path").replace(/^\/+/, "");
        const differ = new Diff(octokit);
        const commentCanary = `<!-- cs278/composer-rich-diff:${composerJson} -->\n\n`;

        if (context.payload.pull_request) {
            // @todo Abort if not running on HEAD commit, so if workflow is being
            // run against an old commit don't replace the comment with out of date
            // information.
            const diff = await differ.generate(
                context.repo.owner,
                context.repo.repo,
                context.payload.pull_request.base.sha,
                context.payload.pull_request.head.sha,
                composerJson
            );

            const commentId = await findCommentId(
                octokit,
                context,
                commentCanary
            );

            if (diff.manifest.size > 0 || diff.lock.size > 0) {
                const message = render(
                    composerJson,
                    context.payload.pull_request.base.sha,
                    context.payload.pull_request.head.sha,
                    diff
                );

                if (commentId) {
                    await octokit.rest.issues.updateComment({
                        ...context.repo,
                        issue_number: context.payload.pull_request.number,
                        comment_id: commentId,
                        body: commentCanary + message,
                    });
                } else {
                    await octokit.rest.issues.createComment({
                        ...context.repo,
                        issue_number: context.payload.pull_request.number,
                        body: commentCanary + message,
                    });
                }
            } else {
                if (commentId) {
                    await octokit.rest.issues.deleteComment({
                        ...context.repo,
                        issue_number: context.payload.pull_request.number,
                        comment_id: commentId,
                    });
                }

                // Otherwise do nothing...
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            core.info(error.stack || "No stack trace");
            core.setFailed(error);
        } else {
            core.setFailed("Unknown error");
        }
    }
}

async function findCommentId(
    octokit: any,
    context: any,
    commentCanary: string
): Promise<number | null> {
    return octokit.rest.issues
        .listComments({
            ...context.repo,
            issue_number: context.payload.pull_request.number,
        })
        .then((response: any) => {
            const comments: Array<any> = response.data;

            const comment = comments.find((comment: any) => {
                return (
                    comment.user.login === "github-actions[bot]" &&
                    comment.body.startsWith(commentCanary)
                );
            });

            return comment ? comment.id : null;
        });
}

run();
