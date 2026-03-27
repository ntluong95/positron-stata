import * as vscode from 'vscode';
import { StataAutocompleteVariable, StataVariableManager } from './variable-manager';

interface CmdInfo {
    label: string;
    detail: string;
    kind: vscode.CompletionItemKind;
}

const VARIABLE_CONTEXT_COMMANDS = new Set<string>([
    'summarize', 'sum', 'describe', 'desc', 'list', 'lis', 'li', 'tabulate', 'tab', 'tabstat',
    'correlate', 'corr', 'pwcorr', 'reg', 'regress', 'logit', 'probit', 'ologit', 'poisson',
    'nbreg', 'qreg', 'mean', 'inspect', 'keep', 'drop', 'rename', 'recode', 'replace', 'order',
    'sort', 'gsort', 'egen', 'gen', 'generate', 'collapse', 'scatter', 'twoway', 'graph',
]);

// Common Stata commands with descriptions
const COMMANDS: CmdInfo[] = [
    // Data I/O
    { label: 'use', detail: 'Load Stata dataset', kind: vscode.CompletionItemKind.Function },
    { label: 'save', detail: 'Save dataset to disk', kind: vscode.CompletionItemKind.Function },
    { label: 'import delimited', detail: 'Import CSV/delimited data', kind: vscode.CompletionItemKind.Function },
    { label: 'import excel', detail: 'Import Excel data', kind: vscode.CompletionItemKind.Function },
    { label: 'export delimited', detail: 'Export to CSV', kind: vscode.CompletionItemKind.Function },
    { label: 'export excel', detail: 'Export to Excel', kind: vscode.CompletionItemKind.Function },
    { label: 'sysuse', detail: 'Load built-in dataset', kind: vscode.CompletionItemKind.Function },
    { label: 'webuse', detail: 'Load dataset from web', kind: vscode.CompletionItemKind.Function },
    { label: 'merge', detail: 'Merge datasets (1:1, m:1, 1:m, m:m)', kind: vscode.CompletionItemKind.Function },
    { label: 'append', detail: 'Append datasets vertically', kind: vscode.CompletionItemKind.Function },
    { label: 'reshape long', detail: 'Reshape data from wide to long', kind: vscode.CompletionItemKind.Function },
    { label: 'reshape wide', detail: 'Reshape data from long to wide', kind: vscode.CompletionItemKind.Function },
    { label: 'collapse', detail: 'Collapse data to summary statistics', kind: vscode.CompletionItemKind.Function },

    // Data manipulation
    { label: 'generate', detail: 'Create new variable', kind: vscode.CompletionItemKind.Function },
    { label: 'gen', detail: 'Create new variable (abbrev)', kind: vscode.CompletionItemKind.Function },
    { label: 'replace', detail: 'Replace values of existing variable', kind: vscode.CompletionItemKind.Function },
    { label: 'drop', detail: 'Drop variables or observations', kind: vscode.CompletionItemKind.Function },
    { label: 'keep', detail: 'Keep variables or observations', kind: vscode.CompletionItemKind.Function },
    { label: 'rename', detail: 'Rename variable', kind: vscode.CompletionItemKind.Function },
    { label: 'recode', detail: 'Recode values', kind: vscode.CompletionItemKind.Function },
    { label: 'encode', detail: 'Encode string to numeric with labels', kind: vscode.CompletionItemKind.Function },
    { label: 'decode', detail: 'Decode numeric to string using labels', kind: vscode.CompletionItemKind.Function },
    { label: 'destring', detail: 'Convert string to numeric', kind: vscode.CompletionItemKind.Function },
    { label: 'tostring', detail: 'Convert numeric to string', kind: vscode.CompletionItemKind.Function },
    { label: 'egen', detail: 'Extensions to generate (group, mean, etc.)', kind: vscode.CompletionItemKind.Function },
    { label: 'label variable', detail: 'Assign variable label', kind: vscode.CompletionItemKind.Function },
    { label: 'label define', detail: 'Define value label', kind: vscode.CompletionItemKind.Function },
    { label: 'label values', detail: 'Attach value label to variable', kind: vscode.CompletionItemKind.Function },
    { label: 'order', detail: 'Reorder variables', kind: vscode.CompletionItemKind.Function },
    { label: 'sort', detail: 'Sort data', kind: vscode.CompletionItemKind.Function },
    { label: 'gsort', detail: 'Sort with ascending/descending', kind: vscode.CompletionItemKind.Function },
    { label: 'duplicates drop', detail: 'Drop duplicate observations', kind: vscode.CompletionItemKind.Function },
    { label: 'duplicates report', detail: 'Report duplicate observations', kind: vscode.CompletionItemKind.Function },

    // Descriptives
    { label: 'summarize', detail: 'Summary statistics', kind: vscode.CompletionItemKind.Function },
    { label: 'tabulate', detail: 'Frequency table', kind: vscode.CompletionItemKind.Function },
    { label: 'describe', detail: 'Describe dataset and variables', kind: vscode.CompletionItemKind.Function },
    { label: 'codebook', detail: 'Detailed variable codebook', kind: vscode.CompletionItemKind.Function },
    { label: 'list', detail: 'List observations', kind: vscode.CompletionItemKind.Function },
    { label: 'count', detail: 'Count observations', kind: vscode.CompletionItemKind.Function },
    { label: 'display', detail: 'Display expression or string', kind: vscode.CompletionItemKind.Function },
    { label: 'correlate', detail: 'Correlation matrix', kind: vscode.CompletionItemKind.Function },
    { label: 'pwcorr', detail: 'Pairwise correlations', kind: vscode.CompletionItemKind.Function },
    { label: 'inspect', detail: 'Quick variable inspection', kind: vscode.CompletionItemKind.Function },
    { label: 'browse', detail: 'Open data viewer', kind: vscode.CompletionItemKind.Function },
    { label: 'mean', detail: 'Estimate means with CIs', kind: vscode.CompletionItemKind.Function },

    // Regression & estimation
    { label: 'regress', detail: 'Linear regression (OLS)', kind: vscode.CompletionItemKind.Function },
    { label: 'logit', detail: 'Logistic regression', kind: vscode.CompletionItemKind.Function },
    { label: 'logistic', detail: 'Logistic regression (odds ratios)', kind: vscode.CompletionItemKind.Function },
    { label: 'probit', detail: 'Probit regression', kind: vscode.CompletionItemKind.Function },
    { label: 'ologit', detail: 'Ordered logistic regression', kind: vscode.CompletionItemKind.Function },
    { label: 'mlogit', detail: 'Multinomial logistic regression', kind: vscode.CompletionItemKind.Function },
    { label: 'poisson', detail: 'Poisson regression', kind: vscode.CompletionItemKind.Function },
    { label: 'nbreg', detail: 'Negative binomial regression', kind: vscode.CompletionItemKind.Function },
    { label: 'tobit', detail: 'Tobit regression', kind: vscode.CompletionItemKind.Function },
    { label: 'heckman', detail: 'Heckman selection model', kind: vscode.CompletionItemKind.Function },
    { label: 'ivregress', detail: 'Instrumental variables regression', kind: vscode.CompletionItemKind.Function },
    { label: 'xtreg', detail: 'Fixed/random effects panel regression', kind: vscode.CompletionItemKind.Function },
    { label: 'areg', detail: 'Regression with absorbed fixed effects', kind: vscode.CompletionItemKind.Function },
    { label: 'reghdfe', detail: 'Multi-way fixed effects regression', kind: vscode.CompletionItemKind.Function },
    { label: 'didregress', detail: 'Difference-in-differences', kind: vscode.CompletionItemKind.Function },
    { label: 'rdrobust', detail: 'Regression discontinuity', kind: vscode.CompletionItemKind.Function },
    { label: 'qreg', detail: 'Quantile regression', kind: vscode.CompletionItemKind.Function },
    { label: 'sem', detail: 'Structural equation model', kind: vscode.CompletionItemKind.Function },
    { label: 'mixed', detail: 'Multilevel mixed-effects model', kind: vscode.CompletionItemKind.Function },
    { label: 'stcox', detail: 'Cox proportional hazards model', kind: vscode.CompletionItemKind.Function },
    { label: 'streg', detail: 'Parametric survival model', kind: vscode.CompletionItemKind.Function },

    // Post-estimation
    { label: 'predict', detail: 'Obtain predictions after estimation', kind: vscode.CompletionItemKind.Function },
    { label: 'margins', detail: 'Marginal effects / predictive margins', kind: vscode.CompletionItemKind.Function },
    { label: 'marginsplot', detail: 'Plot marginal effects', kind: vscode.CompletionItemKind.Function },
    { label: 'test', detail: 'Wald test of coefficients', kind: vscode.CompletionItemKind.Function },
    { label: 'lincom', detail: 'Linear combination of coefficients', kind: vscode.CompletionItemKind.Function },
    { label: 'nlcom', detail: 'Nonlinear combination of coefficients', kind: vscode.CompletionItemKind.Function },
    { label: 'contrast', detail: 'Contrast of margins', kind: vscode.CompletionItemKind.Function },
    { label: 'estat', detail: 'Post-estimation statistics', kind: vscode.CompletionItemKind.Function },
    { label: 'estimates store', detail: 'Store estimation results', kind: vscode.CompletionItemKind.Function },
    { label: 'estimates table', detail: 'Compare stored estimates', kind: vscode.CompletionItemKind.Function },
    { label: 'esttab', detail: 'Export regression table (estout)', kind: vscode.CompletionItemKind.Function },
    { label: 'outreg2', detail: 'Export regression table', kind: vscode.CompletionItemKind.Function },
    { label: 'vif', detail: 'Variance inflation factors', kind: vscode.CompletionItemKind.Function },
    { label: 'hausman', detail: 'Hausman specification test', kind: vscode.CompletionItemKind.Function },
    { label: 'lrtest', detail: 'Likelihood-ratio test', kind: vscode.CompletionItemKind.Function },

    // Graphics
    { label: 'scatter', detail: 'Scatter plot', kind: vscode.CompletionItemKind.Function },
    { label: 'twoway', detail: 'Two-way graph', kind: vscode.CompletionItemKind.Function },
    { label: 'histogram', detail: 'Histogram', kind: vscode.CompletionItemKind.Function },
    { label: 'kdensity', detail: 'Kernel density plot', kind: vscode.CompletionItemKind.Function },
    { label: 'graph bar', detail: 'Bar graph', kind: vscode.CompletionItemKind.Function },
    { label: 'graph box', detail: 'Box plot', kind: vscode.CompletionItemKind.Function },
    { label: 'graph pie', detail: 'Pie chart', kind: vscode.CompletionItemKind.Function },
    { label: 'graph combine', detail: 'Combine multiple graphs', kind: vscode.CompletionItemKind.Function },
    { label: 'graph export', detail: 'Export graph to file', kind: vscode.CompletionItemKind.Function },
    { label: 'coefplot', detail: 'Coefficient plot', kind: vscode.CompletionItemKind.Function },
    { label: 'binscatter', detail: 'Binned scatter plot', kind: vscode.CompletionItemKind.Function },

    // Programming
    { label: 'local', detail: 'Define local macro', kind: vscode.CompletionItemKind.Keyword },
    { label: 'global', detail: 'Define global macro', kind: vscode.CompletionItemKind.Keyword },
    { label: 'foreach', detail: 'Loop over list', kind: vscode.CompletionItemKind.Keyword },
    { label: 'forvalues', detail: 'Loop over numeric range', kind: vscode.CompletionItemKind.Keyword },
    { label: 'while', detail: 'While loop', kind: vscode.CompletionItemKind.Keyword },
    { label: 'program', detail: 'Define program', kind: vscode.CompletionItemKind.Keyword },
    { label: 'capture', detail: 'Capture return code (suppress errors)', kind: vscode.CompletionItemKind.Keyword },
    { label: 'quietly', detail: 'Suppress output', kind: vscode.CompletionItemKind.Keyword },
    { label: 'noisily', detail: 'Display output (inside quietly)', kind: vscode.CompletionItemKind.Keyword },
    { label: 'preserve', detail: 'Preserve current dataset', kind: vscode.CompletionItemKind.Keyword },
    { label: 'restore', detail: 'Restore preserved dataset', kind: vscode.CompletionItemKind.Keyword },
    { label: 'tempvar', detail: 'Create temporary variable name', kind: vscode.CompletionItemKind.Keyword },
    { label: 'tempfile', detail: 'Create temporary file name', kind: vscode.CompletionItemKind.Keyword },
    { label: 'timer', detail: 'Start/stop timer', kind: vscode.CompletionItemKind.Keyword },
    { label: 'assert', detail: 'Assert condition is true', kind: vscode.CompletionItemKind.Keyword },
    { label: 'confirm', detail: 'Confirm existence', kind: vscode.CompletionItemKind.Keyword },

    // Settings & environment
    { label: 'set more off', detail: 'Disable pause on long output', kind: vscode.CompletionItemKind.Function },
    { label: 'set seed', detail: 'Set random number seed', kind: vscode.CompletionItemKind.Function },
    { label: 'set matsize', detail: 'Set maximum matrix size', kind: vscode.CompletionItemKind.Function },
    { label: 'set maxvar', detail: 'Set maximum number of variables', kind: vscode.CompletionItemKind.Function },
    { label: 'clear all', detail: 'Clear all data and programs from memory', kind: vscode.CompletionItemKind.Function },
    { label: 'log using', detail: 'Start logging to file', kind: vscode.CompletionItemKind.Function },
    { label: 'log close', detail: 'Close log file', kind: vscode.CompletionItemKind.Function },
    { label: 'cd', detail: 'Change working directory', kind: vscode.CompletionItemKind.Function },
    { label: 'pwd', detail: 'Print working directory', kind: vscode.CompletionItemKind.Function },
    { label: 'which', detail: 'Show path of ado-file', kind: vscode.CompletionItemKind.Function },
    { label: 'ssc install', detail: 'Install package from SSC', kind: vscode.CompletionItemKind.Function },
    { label: 'help', detail: 'Show help for command', kind: vscode.CompletionItemKind.Function },

    // Panel / TS
    { label: 'xtset', detail: 'Declare panel data', kind: vscode.CompletionItemKind.Function },
    { label: 'tsset', detail: 'Declare time series data', kind: vscode.CompletionItemKind.Function },
    { label: 'stset', detail: 'Declare survival data', kind: vscode.CompletionItemKind.Function },
    { label: 'xtdescribe', detail: 'Describe panel data structure', kind: vscode.CompletionItemKind.Function },
    { label: 'xtsum', detail: 'Panel summary statistics', kind: vscode.CompletionItemKind.Function },
    { label: 'xttab', detail: 'Panel tabulation', kind: vscode.CompletionItemKind.Function },
];

export class StataCompletionProvider implements vscode.CompletionItemProvider {
    private builtInItems: vscode.CompletionItem[];

    constructor(private readonly variableManager: StataVariableManager) {
        this.builtInItems = COMMANDS.map(cmd => {
            const item = new vscode.CompletionItem(cmd.label, cmd.kind);
            item.detail = cmd.detail;
            item.insertText = cmd.label;
            item.sortText = `3_${cmd.label.toLowerCase()}`;
            return item;
        });
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext,
    ): Promise<vscode.CompletionItem[]> {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        if (this.isCommentLine(linePrefix)) {
            return [];
        }

        const userDefinedItems = this.buildUserDefinedProgramItems(document);
        const runtimeVariables = await this.variableManager.getVariableEntriesForForegroundSession();
        const extractedVariables = runtimeVariables.length === 0
            ? [...this.extractVariableNames(document)]
            : [];
        const variableEntries = this.normalizeVariableEntries([
            ...runtimeVariables,
            ...extractedVariables.map((name) => ({ name })),
        ]);
        const variableItems = this.buildVariableItems(variableEntries);

        const inVariableContext = this.isVariableArgumentContext(linePrefix);
        if (inVariableContext) {
            return this.mergeByLabel([...variableItems, ...userDefinedItems, ...this.builtInItems]);
        }

        return this.mergeByLabel([...userDefinedItems, ...variableItems, ...this.builtInItems]);
    }

    private buildUserDefinedProgramItems(document: vscode.TextDocument): vscode.CompletionItem[] {
        const names = new Set<string>();
        for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
            const trimmed = document.lineAt(lineNumber).text.trim();
            if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('//')) {
                continue;
            }

            const programMatch = trimmed.match(/^program\s+(?:define\s+)?([A-Za-z_][A-Za-z0-9_]*)/i);
            if (!programMatch) {
                continue;
            }

            const programName = programMatch[1];
            if (/^(drop|dir|list|define)$/i.test(programName) && !/^program\s+define\s+/i.test(trimmed)) {
                continue;
            }

            names.add(programName);
        }

        return [...names].map(name => {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
            item.detail = 'User-defined Stata program';
            item.insertText = name;
            item.sortText = `1_${name.toLowerCase()}`;
            return item;
        });
    }

    private buildVariableItems(variableEntries: readonly StataAutocompleteVariable[]): vscode.CompletionItem[] {
        return variableEntries.map((variable) => {
            const item = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
            item.detail = variable.label;
            item.insertText = variable.name;
            item.sortText = `2_${variable.name.toLowerCase()}`;
            return item;
        });
    }

    private isCommentLine(linePrefix: string): boolean {
        const trimmed = linePrefix.trimStart();
        return trimmed.startsWith('*') || trimmed.startsWith('//');
    }

    private isVariableArgumentContext(linePrefix: string): boolean {
        const beforeComment = linePrefix.split('//')[0] || '';
        const trimmed = beforeComment.trimStart();
        if (!trimmed || trimmed.startsWith('*')) {
            return false;
        }

        const firstWhitespace = trimmed.search(/\s/);
        if (firstWhitespace < 0) {
            return false;
        }

        const command = trimmed.slice(0, firstWhitespace).toLowerCase();
        return VARIABLE_CONTEXT_COMMANDS.has(command);
    }

    private extractVariableNames(document: vscode.TextDocument): Set<string> {
        const variables = new Set<string>();

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            const trimmed = line.trimStart();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
                continue;
            }

            const genMatch = line.match(/\b(gen|generate|egen)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/i);
            if (genMatch?.[2]) {
                variables.add(genMatch[2]);
            }

            const renameDropKeepMatch = line.match(/\b(rename|drop|keep)\s+(.*?)(?:\n|if|in|,|$)/i);
            if (renameDropKeepMatch?.[2]) {
                const names = renameDropKeepMatch[2]
                    .split(/[\s,]+/)
                    .filter((candidate) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate));
                names.forEach((name) => variables.add(name));
            }

            const cmdPatterns = [
                /\b(summarize|sum|describe|desc|list|lis|li|tabulate|tab|tabstat|correlate|corr|pwcorr)\s+(.*?)(?:\n|,|$)/i,
                /\b(reg|regress|logit|probit|ologit|poisson|nbreg)\s+(.*?)\s+(?:if|in|,|$)/i,
                /\b(scatter|twoway|graph)\s+(.*?)(?:\n|,|$)/i,
            ];

            for (const pattern of cmdPatterns) {
                const match = line.match(pattern);
                if (!match?.[2]) {
                    continue;
                }

                const names = match[2]
                    .split(/[\s,]+/)
                    .filter((candidate) => candidate && !/^[0-9]/.test(candidate));
                names.forEach((name) => {
                    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                        variables.add(name);
                    }
                });
            }
        }

        return variables;
    }

    private normalizeVariableEntries(
        values: readonly StataAutocompleteVariable[],
    ): StataAutocompleteVariable[] {
        const seen = new Set<string>();
        const normalized: StataAutocompleteVariable[] = [];

        for (const value of values) {
            const trimmed = value.name.trim();
            if (!trimmed) {
                continue;
            }

            const key = trimmed.toLowerCase();
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            const label = typeof value.label === 'string' ? value.label.trim() : '';
            normalized.push({
                name: trimmed,
                label: label || undefined,
            });
        }

        return normalized.sort((left, right) => left.name.localeCompare(right.name));
    }

    private mergeByLabel(items: readonly vscode.CompletionItem[]): vscode.CompletionItem[] {
        const merged: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        for (const item of items) {
            const label = typeof item.label === 'string' ? item.label : item.label.label;
            const key = label.toLowerCase();
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            merged.push(item);
        }

        return merged;
    }
}
