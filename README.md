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

![DO-file syntax highlighting](https://raw.githubusercontent.com/ntluong95/positron-stata/refs/heads/main/resources/completion_provider.png)

Add a completion provider per Trigger sugestion, providing variable list and label

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

## Quarto Integration

Inside **Positron**, this extension registers Stata as a language runtime. Quarto Preview uses the active Stata session to execute `{stata}` cells — no extra configuration is required for the IDE workflow.

For **`quarto render` / `quarto preview` from the command line**, Quarto resolves a separate execution engine that is independent of the IDE extension. Choose the path that matches your workflow:

### Engine options

| Scenario | Engine | Extra prerequisites |
|---|---|---|
| Stata-only `.qmd` | knitr + Stata engine | R ≥ 4.0, `knitr` package |
| Stata-only `.qmd` (no R) | Jupyter + nbstata | Python, `nbstata` |
| R + Stata polyglot | knitr | R ≥ 4.0, `knitr` package |
| Python + Stata polyglot | knitr + reticulate | R ≥ 4.0, `knitr`, `reticulate`, Python |

### Path A — knitr engine (R + Stata, recommended for R users)

knitr has a built-in Stata execution engine. Add a setup chunk that points to your Stata executable, then write `{stata}` cells anywhere in the document:

```r
# In a {r setup, include=FALSE} chunk:
knitr::opts_chunk$set(
  engine.path = list(
    stata = "/path/to/stata"
    # Linux/macOS example : "/usr/local/stata18/stata-mp"
    # Windows example     : "C:/Program Files/Stata18/StataMP-64.exe"
  )
)
```

````qmd
```{stata}
sysuse auto, clear
summarize price mpg
```
````

If `stata` is already on your `PATH`, the `engine.path` override is not needed.

**Prerequisites:** R ≥ 4.0, knitr package (`install.packages("knitr")`).

### Path B — Jupyter + nbstata (Stata-only, no R required)

Install [nbstata](https://github.com/hugetim/nbstata), a Jupyter kernel for Stata:

```bash
pip install nbstata
python -m nbstata.install
```

Declare the Jupyter kernel in your document front-matter:

```yaml
---
title: "Stata Analysis"
jupyter: nbstata
---
```

Then write Stata cells directly:

````qmd
```{stata}
sysuse auto, clear
summarize price mpg
```
````

### Path C — Python + Stata polyglot (knitr with reticulate)

Both Python and Stata chunks can coexist in a knitr document. Python runs via `reticulate`; Stata runs via knitr's Stata engine. Share data between them through exported files (CSV, DTA).

```r
# {r setup, include=FALSE}
library(reticulate)
knitr::opts_chunk$set(
  engine.path = list(stata = "/path/to/stata")
)
```

````qmd
```{stata}
sysuse auto, clear
export delimited auto_temp.csv, replace
```

```{python}
import pandas as pd
df = pd.read_csv("auto_temp.csv")
print(df[["price", "mpg"]].describe())
```
````

> **Note:** `nbformat` and `nbclient` are Jupyter notebook execution libraries. If your Quarto workflow requires them, install them into the Python environment that Quarto uses (`QUARTO_PYTHON` or your project venv) — **not** into this extension's managed environment, which is reserved for the MCP server.

See [`examples/`](./examples/) for complete, copy-ready `.qmd` files covering each scenario above.

## Requirements

- Positron IDE with extension API support compatible with VS Code `^1.99.0`
- Stata 17 or later installed locally
- Node.js and npm for extension development
- Python 3.9+ plus `uv` for the bundled server environment

On first launch the extension can provision its own Python environment via [`python/check-python.js`](./python/check-python.js). The script prefers `uv`, creates `.venv`, installs [`python/requirements.txt`](./python/requirements.txt), and stores the resolved interpreter in `.python-path`.

## Attribution And Licensing

This project intentionally reuses upstream logic from `hanlulong/stata-mcp`.
