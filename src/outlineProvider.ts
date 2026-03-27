import * as vscode from 'vscode';
import { getStataConfiguration } from './configuration';
import {
    collectStataSectionHeaders,
    getStataSectionEndLine,
    type StataSectionHeader,
} from './stata-sections';

interface OutlineStackItem {
    level: number;
    symbol: vscode.DocumentSymbol;
}

function updateSectionCounters(counters: number[], level: number): string {
    while (counters.length < level) {
        counters.push(0);
    }

    counters[level - 1] += 1;

    for (let index = level; index < counters.length; index += 1) {
        counters[index] = 0;
    }

    return counters.slice(0, level).join('.');
}

export class StataOutlineProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
    ): vscode.DocumentSymbol[] {
        const lines = Array.from({ length: document.lineCount }, (_, lineNumber) => document.lineAt(lineNumber).text);
        const headers = collectStataSectionHeaders(lines);
        const numberingEnabled = getStataConfiguration().outlineNumberingShow;
        const rootSymbols: vscode.DocumentSymbol[] = [];
        const stack: OutlineStackItem[] = [];
        const sectionCounters: number[] = [];
        const headerByLine = new Map<number, { header: StataSectionHeader; symbol: vscode.DocumentSymbol }>();

        for (let index = 0; index < headers.length; index += 1) {
            const header = headers[index];
            const startLine = header.lineNumber;
            const endLine = getStataSectionEndLine(headers, index, document.lineCount - 1);
            const endCharacter = document.lineAt(Math.max(endLine, startLine)).range.end.character;
            const displayNumbering = numberingEnabled ? `${updateSectionCounters(sectionCounters, header.level)} ` : '';
            const titleRange = document.lineAt(startLine).range;
            const fullRange = new vscode.Range(startLine, 0, Math.max(endLine, startLine), endCharacter);

            const symbol = new vscode.DocumentSymbol(
                `${displayNumbering}${header.title}`,
                'section',
                vscode.SymbolKind.Module,
                fullRange,
                titleRange,
            );

            while (stack.length > 0 && stack[stack.length - 1].level >= header.level) {
                stack.pop();
            }

            if (stack.length > 0) {
                stack[stack.length - 1].symbol.children.push(symbol);
            } else {
                rootSymbols.push(symbol);
            }

            stack.push({ level: header.level, symbol });
            headerByLine.set(startLine, { header, symbol });
        }

        for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
            if (headerByLine.has(lineNumber)) {
                continue;
            }

            const line = document.lineAt(lineNumber);
            const trimmed = line.text.trim();

            if (/^\*/.test(trimmed)) {
                const commentBody = trimmed.replace(/^\*\s*/, '').trim();

                if (!commentBody || /^[-=*|_~#+\s]+$/.test(commentBody)) {
                    continue;
                }

                const textOnly = commentBody.replace(/[-=*|_~#+\s]/g, '');
                if (textOnly.length < 3) {
                    continue;
                }

                const isNumbered = /^\d+[\.\)]\s+/.test(commentBody);
                const isAllCaps = textOnly === textOnly.toUpperCase() && textOnly.length > 3;
                const hasSeparatorContext = this.hasSeparatorNeighbor(document, lineNumber);

                if (isNumbered || isAllCaps || hasSeparatorContext) {
                    const title = commentBody
                        .replace(/^[-=*\s]+/, '')
                        .replace(/[-=*\s]+$/, '')
                        .trim();

                    if (title.length >= 3) {
                        const symbol = new vscode.DocumentSymbol(
                            title,
                            'section',
                            vscode.SymbolKind.Module,
                            line.range,
                            line.range,
                        );
                        this.appendToCurrentSection(rootSymbols, headerByLine, headers, lineNumber, symbol);
                    }
                }
                continue;
            }

            const progMatch = trimmed.match(/^program\s+(?:define\s+)?(\w+)/i);
            if (progMatch) {
                const name = progMatch[1];
                if (/^(drop|dir|list|define)$/i.test(name) && !/^program\s+define\s+/i.test(trimmed)) {
                    continue;
                }

                const symbol = new vscode.DocumentSymbol(
                    name,
                    'program',
                    vscode.SymbolKind.Function,
                    line.range,
                    line.range,
                );
                this.appendToCurrentSection(rootSymbols, headerByLine, headers, lineNumber, symbol);
                continue;
            }

            const loopMatch = trimmed.match(/^(foreach|forvalues)\s+(.+?)\s*\{/i);
            if (loopMatch) {
                const symbol = new vscode.DocumentSymbol(
                    `${loopMatch[1]} ${loopMatch[2].trim()}`,
                    'loop',
                    vscode.SymbolKind.Variable,
                    line.range,
                    line.range,
                );
                this.appendToCurrentSection(rootSymbols, headerByLine, headers, lineNumber, symbol);
            }
        }

        return rootSymbols;
    }

    private appendToCurrentSection(
        rootSymbols: vscode.DocumentSymbol[],
        headerByLine: Map<number, { header: StataSectionHeader; symbol: vscode.DocumentSymbol }>,
        headers: readonly StataSectionHeader[],
        lineNumber: number,
        symbol: vscode.DocumentSymbol,
    ): void {
        for (let index = headers.length - 1; index >= 0; index -= 1) {
            const header = headers[index];
            if (header.lineNumber > lineNumber) {
                continue;
            }

            const endLine = getStataSectionEndLine(headers, index, Number.MAX_SAFE_INTEGER);
            if (lineNumber <= endLine) {
                const parent = headerByLine.get(header.lineNumber);
                if (parent) {
                    parent.symbol.children.push(symbol);
                    return;
                }
            }
        }

        rootSymbols.push(symbol);
    }

    private hasSeparatorNeighbor(doc: vscode.TextDocument, lineNum: number): boolean {
        const check = (n: number) => {
            if (n < 0 || n >= doc.lineCount) {
                return false;
            }
            const text = doc.lineAt(n).text.trim().replace(/^\*\s*/, '');
            return /^[-=*|_~#+\s]{5,}$/.test(text);
        };

        return check(lineNum - 1) || check(lineNum + 1);
    }
}
