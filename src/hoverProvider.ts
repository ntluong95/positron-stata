import * as vscode from 'vscode';

const HELP: Record<string, string> = {
    // Data I/O
    use: 'Load a Stata dataset (.dta) into memory',
    save: 'Save current dataset to disk as .dta',
    sysuse: 'Load a built-in Stata example dataset',
    webuse: 'Load a dataset from the Stata web server',
    import: 'Import data from CSV, Excel, or other formats',
    export: 'Export data to CSV, Excel, or other formats',
    insheet: 'Read text-delimited data (legacy; use `import delimited`)',
    merge: 'Merge two datasets by key variables (1:1, m:1, 1:m)',
    append: 'Append datasets vertically (stack rows)',
    reshape: 'Reshape data between wide and long format',
    collapse: 'Collapse data to summary statistics by groups',

    // Data manipulation
    generate: 'Create a new variable from an expression',
    gen: 'Create a new variable (abbreviation of `generate`)',
    replace: 'Replace values of an existing variable',
    drop: 'Drop variables or observations from the dataset',
    keep: 'Keep only specified variables or observations',
    rename: 'Rename a variable',
    recode: 'Recode values of a variable',
    encode: 'Encode a string variable to numeric with value labels',
    decode: 'Decode a labeled numeric variable to string',
    destring: 'Convert string variables to numeric',
    tostring: 'Convert numeric variables to string',
    egen: 'Extended generate — group(), mean(), total(), etc.',
    label: 'Define or assign variable labels and value labels',
    order: 'Reorder variables in the dataset',
    sort: 'Sort observations in ascending order',
    gsort: 'Sort observations (ascending or descending)',

    // Descriptives
    summarize: 'Summary statistics (mean, sd, min, max)',
    sum: 'Summary statistics (abbreviation of `summarize`)',
    tabulate: 'One-way or two-way frequency tables',
    tab: 'Frequency tables (abbreviation of `tabulate`)',
    describe: 'Describe dataset structure and variable types',
    des: 'Describe dataset (abbreviation)',
    codebook: 'Detailed variable codebook with distributions',
    list: 'List observations in the dataset',
    browse: 'Open the Data Viewer (intercepted by VS Code extension)',
    display: 'Display a string or expression result',
    di: 'Display (abbreviation)',
    count: 'Count the number of observations',
    correlate: 'Correlation matrix',
    pwcorr: 'Pairwise correlations with significance',
    inspect: 'Quick overview of variable values',
    mean: 'Estimate means with confidence intervals',

    // Regression
    regress: 'Linear regression (OLS). Syntax: `reg depvar indepvars, options`',
    reg: 'Linear regression (abbreviation of `regress`)',
    logit: 'Logistic regression (log-odds coefficients)',
    logistic: 'Logistic regression (odds ratios)',
    probit: 'Probit regression',
    ologit: 'Ordered logistic regression',
    mlogit: 'Multinomial logistic regression',
    poisson: 'Poisson regression for count data',
    nbreg: 'Negative binomial regression',
    tobit: 'Tobit regression for censored data',
    heckman: 'Heckman selection model',
    ivregress: 'Instrumental variables regression (2SLS, GMM, LIML)',
    xtreg: 'Panel data regression (fixed effects, random effects)',
    areg: 'Linear regression absorbing one set of fixed effects',
    reghdfe: 'Multi-way fixed effects regression (community-contributed)',
    didregress: 'Difference-in-differences estimation',
    qreg: 'Quantile regression',
    mixed: 'Multilevel / mixed-effects linear regression',
    sem: 'Structural equation modeling',
    stcox: 'Cox proportional hazards survival model',
    streg: 'Parametric survival regression',

    // Post-estimation
    predict: 'Generate predictions, residuals, or other statistics after estimation',
    margins: 'Marginal effects, predictive margins, or marginal means',
    marginsplot: 'Plot results from `margins`',
    test: 'Wald test of linear hypotheses after estimation',
    testnl: 'Wald test of nonlinear hypotheses',
    lincom: 'Linear combination of estimated coefficients',
    nlcom: 'Nonlinear combination of estimated coefficients',
    contrast: 'Contrasts and comparisons of factor levels',
    estat: 'Post-estimation statistics (varies by estimation command)',
    estimates: 'Save, restore, and manage estimation results',
    esttab: 'Export estimation tables (community-contributed)',
    outreg2: 'Export regression output to Word/Excel/TeX',
    vif: 'Variance inflation factors (after `regress`)',
    hausman: 'Hausman specification test (FE vs RE)',
    lrtest: 'Likelihood-ratio test comparing nested models',

    // Graphics
    scatter: 'Scatter plot of two variables',
    twoway: 'Two-way (xy) graph with multiple plot types',
    histogram: 'Histogram of a variable',
    kdensity: 'Kernel density plot',
    graph: 'Graph command — bar, box, pie, combine, export, etc.',
    coefplot: 'Plot regression coefficients (community-contributed)',
    binscatter: 'Binned scatter plot (community-contributed)',

    // Programming
    local: 'Define a local macro: `local name = expression`',
    global: 'Define a global macro: `global name = expression`',
    foreach: 'Loop over a list: `foreach var of varlist x y z { ... }`',
    forvalues: 'Loop over numbers: `forvalues i = 1/10 { ... }`',
    program: 'Define a Stata program: `program define name ... end`',
    capture: 'Execute command and capture return code (suppress errors)',
    quietly: 'Execute command suppressing all output',
    noisily: 'Execute command showing output (inside `quietly` block)',
    preserve: 'Preserve current dataset state (use with `restore`)',
    restore: 'Restore previously preserved dataset',
    tempvar: 'Create a temporary variable name',
    tempfile: 'Create a temporary file name',
    tempname: 'Create a temporary scalar/matrix name',
    assert: 'Assert that a condition is true (error if false)',
    confirm: 'Confirm existence of file, variable, etc.',
    return: 'Set return values from a program',
    ereturn: 'Set estimation return values',
    matrix: 'Matrix operations and manipulation',
    scalar: 'Define or display a scalar',
    timer: 'Start/stop execution timer',
    set: 'Set Stata system parameters',
    clear: 'Clear data, programs, or all from memory',
    exit: 'Exit a program or Stata',
    version: 'Set Stata version for compatibility',
    which: 'Show location of an ado-file or command',
    ssc: 'Install or describe packages from SSC archive',
    help: 'Display help for a Stata command',
    cd: 'Change working directory',
    pwd: 'Print working directory',
    log: 'Start or stop a log file',
    cmdlog: 'Start or stop a command log',

    // Panel / time series
    xtset: 'Declare panel data structure (panel + time variables)',
    tsset: 'Declare time-series data structure',
    stset: 'Declare survival-time data',
    xtdescribe: 'Describe pattern of panel data',
    xtsum: 'Panel data summary statistics (within/between)',
    xttab: 'Tabulate panel data transitions',
};

export class StataHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!range) { return undefined; }

        const word = document.getText(range).toLowerCase();
        const desc = HELP[word];
        if (!desc) { return undefined; }

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${word}** — ${desc}`);
        return new vscode.Hover(md, range);
    }
}
