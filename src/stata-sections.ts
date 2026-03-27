export interface StataSectionHeader {
    lineNumber: number;
    level: number;
    title: string;
}

const SECTION_HEADER_REGEX = /^\s*\*{2}\s*(#{1,6})\s*(.*?)\s*$/;
const OUTLINE_NUMBERING_PREFIX_REGEX = /^\d+(?:\.\d+)*\s+/;

export function parseStataSectionHeader(line: string): Omit<StataSectionHeader, 'lineNumber'> | undefined {
    const match = SECTION_HEADER_REGEX.exec(line);
    if (!match) {
        return undefined;
    }

    const level = match[1].length;
    const rawTitle = match[2].trim();
    if (!rawTitle) {
        return undefined;
    }

    const title = rawTitle.replace(OUTLINE_NUMBERING_PREFIX_REGEX, '').trim() || rawTitle;
    return { level, title };
}

export function collectStataSectionHeaders(lines: readonly string[]): StataSectionHeader[] {
    const headers: StataSectionHeader[] = [];

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
        const parsed = parseStataSectionHeader(lines[lineNumber]);
        if (!parsed) {
            continue;
        }

        headers.push({
            lineNumber,
            level: parsed.level,
            title: parsed.title,
        });
    }

    return headers;
}

export function getStataSectionEndLine(headers: readonly StataSectionHeader[], headerIndex: number, fallbackEnd: number): number {
    const header = headers[headerIndex];
    if (!header) {
        return fallbackEnd;
    }

    for (let index = headerIndex + 1; index < headers.length; index += 1) {
        if (headers[index].level <= header.level) {
            return headers[index].lineNumber - 1;
        }
    }

    return fallbackEnd;
}

export function getStataSectionRange(lines: readonly string[], headerLine: number): { startLine: number; endLine: number } | undefined {
    if (headerLine < 0 || headerLine >= lines.length) {
        return undefined;
    }

    const header = parseStataSectionHeader(lines[headerLine]);
    if (!header) {
        return undefined;
    }

    let endLine = lines.length - 1;
    for (let lineNumber = headerLine + 1; lineNumber < lines.length; lineNumber += 1) {
        const nextHeader = parseStataSectionHeader(lines[lineNumber]);
        if (nextHeader && nextHeader.level <= header.level) {
            endLine = lineNumber - 1;
            break;
        }
    }

    return {
        startLine: headerLine,
        endLine: Math.max(headerLine, endLine),
    };
}
