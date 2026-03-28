export interface ParsedStataTable {
    rows: string[][];
    tsv: string;
}

const TABLE_SEPARATOR_PATTERN = /^[\s\-+=|]+$/;

function normalizeOutput(output: string): string {
    return output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitDenseColumns(segment: string): string[] {
    const trimmed = segment.trim();
    if (!trimmed) {
        return [];
    }

    // Stata uses repeated spaces to align columns inside each pipe-delimited region.
    return trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
}

function parseTableRow(line: string): string[] | undefined {
    if (!line.includes("|")) {
        return undefined;
    }

    const pipeSegments = line.split("|");
    if (pipeSegments.length < 2) {
        return undefined;
    }

    const cells: string[] = [];
    for (const segment of pipeSegments) {
        const denseCells = splitDenseColumns(segment);
        for (const cell of denseCells) {
            cells.push(cell.replace(/\t/g, " "));
        }
    }

    if (cells.length < 2) {
        return undefined;
    }

    return cells;
}

function isSeparatorLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length > 0 && TABLE_SEPARATOR_PATTERN.test(trimmed) && /[-=]{3,}/.test(trimmed);
}

function isCandidateTableLine(line: string): boolean {
    return Boolean(parseTableRow(line)) || isSeparatorLine(line);
}

function padRows(rows: string[][]): string[][] {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (width <= 0) {
        return rows;
    }

    return rows.map((row) => {
        if (row.length >= width) {
            return row;
        }
        return [...row, ...Array.from({ length: width - row.length }, () => "")];
    });
}

function rowsToTsv(rows: string[][]): string {
    return rows
        .map((row) => row.map((cell) => cell.replace(/\n/g, " ")).join("\t"))
        .join("\n");
}

export function extractLatestTableFromOutput(
    output: string,
): ParsedStataTable | undefined {
    const lines = normalizeOutput(output).split("\n");
    let end = -1;

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (parseTableRow(lines[i])) {
            end = i;
            break;
        }
    }

    if (end < 0) {
        return undefined;
    }

    let start = end;
    for (let i = end - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (!line.trim()) {
            break;
        }
        if (!isCandidateTableLine(line)) {
            break;
        }
        start = i;
    }

    let expandedEnd = end;
    for (let i = end + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line.trim()) {
            break;
        }
        if (!isCandidateTableLine(line)) {
            break;
        }
        expandedEnd = i;
    }

    const parsedRows = lines
        .slice(start, expandedEnd + 1)
        .map((line) => parseTableRow(line))
        .filter((row): row is string[] => Array.isArray(row));

    if (parsedRows.length < 2) {
        return undefined;
    }

    const rows = padRows(parsedRows);
    return {
        rows,
        tsv: rowsToTsv(rows),
    };
}
