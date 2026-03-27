import * as vscode from 'vscode';

export class StataOutlineProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            const trimmed = text.trim();

            // Program definitions: "program define name" or "program name"
            const progMatch = trimmed.match(/^program\s+(?:define\s+)?(\w+)/i);
            if (progMatch) {
                const name = progMatch[1];
                if (/^(drop|dir|list|define)$/i.test(name)) {
                    if (!/^program\s+define\s+/i.test(trimmed)) {
                        continue;
                    }
                }
                symbols.push(new vscode.DocumentSymbol(
                    name, 'program', vscode.SymbolKind.Function,
                    line.range, line.range,
                ));
                continue;
            }

            // Section headers: comment lines with actual title text.
            // Pattern: look for a comment line that contains words (not just dashes/stars/equals).
            // The title is on the NEXT or PREVIOUS line if this is a separator.
            // Common Stata patterns:
            //   * --- Title ---
            //   * === Title ===
            //   * Title
            //   * 1. Title
            // Skip pure separator lines: * -------, * =======, * *******
            if (/^\*/.test(trimmed)) {
                const commentBody = trimmed.replace(/^\*\s*/, '').trim();

                // Skip pure separator lines (only dashes, equals, stars, spaces, pipes)
                if (!commentBody || /^[-=*|_~#+\s]+$/.test(commentBody)) {
                    continue;
                }

                // Skip very short comments (less than 3 chars of actual text)
                const textOnly = commentBody.replace(/[-=*|_~#+\s]/g, '');
                if (textOnly.length < 3) {
                    continue;
                }

                // Detect numbered sections: "1. Title" or "Section Title"
                // Only show if it looks like a section header (has a number prefix,
                // or is between separator lines, or is ALL CAPS, or starts with a keyword)
                const isNumbered = /^\d+[\.\)]\s+/.test(commentBody);
                const isAllCaps = textOnly === textOnly.toUpperCase() && textOnly.length > 3;
                const hasSeparatorContext = this.hasSeparatorNeighbor(document, i);

                if (isNumbered || isAllCaps || hasSeparatorContext) {
                    // Clean up the title: remove trailing separator chars
                    const title = commentBody
                        .replace(/^[-=*\s]+/, '')
                        .replace(/[-=*\s]+$/, '')
                        .trim();

                    if (title.length >= 3) {
                        symbols.push(new vscode.DocumentSymbol(
                            title, 'section', vscode.SymbolKind.Module,
                            line.range, line.range,
                        ));
                    }
                }
                continue;
            }

            // Loops: foreach ... { and forvalues ... {
            const loopMatch = trimmed.match(/^(foreach|forvalues)\s+(.+?)\s*\{/i);
            if (loopMatch) {
                symbols.push(new vscode.DocumentSymbol(
                    `${loopMatch[1]} ${loopMatch[2].trim()}`, 'loop',
                    vscode.SymbolKind.Variable,
                    line.range, line.range,
                ));
                continue;
            }
        }

        return symbols;
    }

    /** Check if the line above or below is a separator (--- or === or ***) */
    private hasSeparatorNeighbor(doc: vscode.TextDocument, lineNum: number): boolean {
        const check = (n: number) => {
            if (n < 0 || n >= doc.lineCount) { return false; }
            const t = doc.lineAt(n).text.trim().replace(/^\*\s*/, '');
            return /^[-=*|_~#+\s]{5,}$/.test(t);
        };
        return check(lineNum - 1) || check(lineNum + 1);
    }
}
