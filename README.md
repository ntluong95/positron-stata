# STATA for Positron

`positron-stata` is a Positron-native Stata extension that preserves the proven Python MCP and session logic from [`hanlulong/stata-mcp`](https://github.com/hanlulong/stata-mcp) while replacing the outer extension shell with the runtime/session architecture compatible with Positron IDE.

## Positron Features

- Discover or configure a local Stata installation and expose it as a Positron language runtime
- Run the current selection or current line in the Positron console
- Run the current `.do`, `.ado`, `.doh`, or `.mata` file through the preserved streaming server
- Restart or stop a Stata session without restarting the IDE
- Render Stata help topics in the Positron Help pane
- Render `browse` output in the Positron's interactive Data Explorer
- Surface exported graphs in Positron's Plots pane when `positron.stata.autoDisplayGraphs` is enabled

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
