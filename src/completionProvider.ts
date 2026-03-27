import * as vscode from 'vscode';

interface CmdInfo {
    label: string;
    detail: string;
    kind: vscode.CompletionItemKind;
}

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
    private items: vscode.CompletionItem[];

    constructor() {
        this.items = COMMANDS.map(cmd => {
            const item = new vscode.CompletionItem(cmd.label, cmd.kind);
            item.detail = cmd.detail;
            item.insertText = cmd.label;
            return item;
        });
    }

    provideCompletionItems(): vscode.CompletionItem[] {
        return this.items;
    }
}
