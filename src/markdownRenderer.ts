import { ComposerDiff, Section, Operation } from "./diff";

export function render(
    composerJson: string,
    baseRef: string,
    headRef: string,
    diff: ComposerDiff
): string {
    const message = new Array<string>();

    message.push(`## Changes to \`${composerJson}\``);

    if (diff.manifest.size > 0) {
        message.push("### Changes to requirements");
        message.push(
            "| Package | Section | Operation | Base Constraint | Head Constraint |"
        );
        message.push(
            "| ------- | ------- | --------- | --------------- | --------------- |"
        );

        const manifestChanges = Array.from(diff.manifest.values());

        manifestChanges.sort((a, b) => {
            if (a.section === b.section) {
                return a.name.localeCompare(b.name);
            }

            if (a.section === Section.Prod) {
                return -1;
            }

            return 1;
        });

        manifestChanges.forEach((entry) => {
            const row = new Array<string>();
            let operationText: string = "";

            if (entry.operation & Operation.Updated) {
                operationText = "Updated";
            }

            if (entry.operation & Operation.Added) {
                operationText = "**Added**";
            }

            if (entry.operation & Operation.Removed) {
                operationText = "Removed";
            }

            if (entry.operation & Operation.Moved) {
                operationText = operationText
                    ? operationText + " & Moved[^Moved]"
                    : "Moved[^Moved]";
            }

            row[0] = renderInlineCodeInsideTableCell(entry.name);
            row[1] = entry.section === Section.Prod ? "Prod" : "Dev";
            row[2] = operationText;
            row[3] =
                entry.operation & Operation.Added ? "" : renderInlineCodeInsideTableCell(entry.base);
            row[4] =
                entry.operation & Operation.Removed ? "" : renderInlineCodeInsideTableCell(entry.head);
``
            message.push("| " + row.join(" | ") + " |");
        });
    }

    if (diff.lock.size > 0) {
        message.push("### Changes to locked packages");
        message.push(
            "| Package | Section | Direct | Operation | Base Version | Head Version | Link |"
        );
        message.push(
            "| ------- | ------- | ------ | --------- | ------------ | ------------ | ----"
        );

        const lockChanges = Array.from(diff.lock.values());

        lockChanges.sort((a, b) => {
            if (a.section === b.section) {
                return a.name.localeCompare(b.name);
            }

            if (a.section === Section.Prod) {
                return -1;
            }

            return 1;
        });

        lockChanges.forEach((entry) => {
            const row = new Array<string>();
            let operationText: string = "";

            if (entry.operation & Operation.Updated) {
                operationText = "Updated";
            }

            if (entry.operation & Operation.Added) {
                operationText = "**Added**";
            }

            if (entry.operation & Operation.Removed) {
                operationText = "Removed";
            }

            if (entry.operation & Operation.Moved) {
                operationText = operationText
                    ? operationText + " & Moved[^Moved]"
                    : "Moved[^Moved]";
            }

            row[0] = `\`${entry.name}\``;
            row[1] = entry.section === Section.Prod ? "Prod" : "Dev";
            row[2] = entry.direct ? "Yes" : "No";
            row[3] = operationText;
            row[4] =
                entry.operation & Operation.Added
                    ? "Absent"
                    : `\`${entry.base!.version}\``;
            row[5] =
                entry.operation & Operation.Removed
                    ? "Absent"
                    : `\`${entry.head!.version}\``;
            row[6] =
                entry.operation & Operation.Updated && entry.link
                    ? `[Diff](${entry.link})`
                    : "";

            message.push("| " + row.join(" | ") + " |");
        });
    }

    message.push("");
    message.push("---");
    message.push(`Generated using ${baseRef} and ${headRef}`);
    message.push("");
    message.push(
        "[^Moved]: Depepdency was moved from the non-dev section to dev section or vice versa."
    );

    return message.join("\n");
}

/**
 * Workaround problem with GHFM whereby an inline code block inside a table cell
 * cannot contain a pipe without breaking the table.
 *
 * https://stackoverflow.com/a/17320389
 */
function renderInlineCodeInsideTableCell(content: string|null): string {
    if (content === null) {
        return '';
    }

    if (content.indexOf('|') >= 0) {
        content = htmlEscape(content).replace(/\|/g, '&#124;');

        return `<code>${content}</code>`;
    }

    return `\`${content}\``;
}

function htmlEscape(content: string): string {
    return content
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
