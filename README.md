# STATA for Positron

`positron-stata` is a Positron-native Stata extension that preserves the proven Python MCP and session logic from [`hanlulong/stata-mcp`](https://github.com/hanlulong/stata-mcp) while replacing the outer extension shell with the runtime/session architecture compatible with Positron IDE.

## Key Features

### Console

![Console pane](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/console.png)

Interactive Stata console backed by the MCP server, showing session startup and the prompt for running commands.

### Data Explorer

![Data Explorer](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/data_explorer.png)

Interactive data viewer showing variables, brief summaries and a spreadsheet-like table for `browse` output. It also support display variable label as a tooltip, summary statistics and filtering data

### DO-file Editor & Syntax

![DO-file syntax highlighting](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/dofile_syntax.png)

Stata `.do` file editor with syntax highlighting, inline execution controls, and integrated results.

### Environment & Plots

![Environment and plot panes](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/environment_and_plot.png)

Session variables and Plots pane — exported Stata graphs render directly inside Positron.

### Help Pane

![Help pane](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/help_pane.png)

Rendered Stata help topics with syntax, options and examples available inline in the Help pane.

### History

![History pane](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/history_pane.png)

Command history panel that preserves executed commands and can re-run or send commands back to the console.

### Inline Output (Quarto)

![Inline output in QMD](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/inline_ouput_qmd.png)

Preview of Stata output embedded inline in Quarto (.qmd) documents — rendered code results and plots appear directly alongside narrative text.

## Requirements

- Positron IDE with extension API support compatible with VS Code `^1.99.0`
- Stata 17 or later installed locally
- Node.js and npm for extension development
- Python 3.9+ plus `uv` for the bundled server environment

On first launch the extension can provision its own Python environment via [`python/check-python.js`](./python/check-python.js). The script prefers `uv`, creates `.venv`, installs [`python/requirements.txt`](./python/requirements.txt), and stores the resolved interpreter in `.python-path`.

## Commands

- `Stata: New Stata File`
- `Stata: Run Selection or Current Line`
- `Stata: Run Current File`
- `Stata: Stop Execution`
- `Stata: View Data`
- `Stata: Restart Session`
- `Stata: Test Server Connection`
- `Stata: Show Extension Logs`

## Configuration

The extension uses the `positron.stata.*` namespace:

- `positron.stata.installationPath`
- `positron.stata.edition`
- `positron.stata.server.host`
- `positron.stata.server.port`
- `positron.stata.server.autoStart`
- `positron.stata.server.forcePort`
- `positron.stata.debug`
- `positron.stata.autoDisplayGraphs`
- `positron.stata.runSelectionTimeout`
- `positron.stata.runFileTimeout`
- `positron.stata.workingDirectory.mode`
- `positron.stata.workingDirectory.customPath`
- `positron.stata.mcp.resultDisplayMode`
- `positron.stata.mcp.maxOutputTokens`
- `positron.stata.multiSession.enabled`
- `positron.stata.multiSession.maxSessions`
- `positron.stata.multiSession.sessionTimeout`
- `positron.stata.dataViewer.maxRows`

## Attribution And Licensing

This project intentionally reuses upstream logic from `hanlulong/stata-mcp`.
