#!/usr/bin/env python3
"""Tests for Quarto polyglot integration documentation and examples.

These are *unit* tests — no Stata, R, or Python data-science installation is
required. They validate the structure and content of:

  * examples/*.qmd   — copy-ready Quarto documents
  * README.md        — Quarto Integration section
  * python/requirements.txt — must not contain packages that belong in a
                              different environment (e.g. nbformat, nbclient)
"""

import pytest
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent
EXAMPLES_DIR = REPO_ROOT / "examples"
README_PATH = REPO_ROOT / "README.md"
REQUIREMENTS_PATH = REPO_ROOT / "python" / "requirements.txt"

EXAMPLE_FILES = [
    "stata-only.qmd",
    "stata-r-polyglot.qmd",
    "stata-python-polyglot.qmd",
]


# ===========================================================================
# Example .qmd files
# ===========================================================================

class TestExampleFilesExist:
    """Every documented scenario must have a corresponding example file."""

    def test_examples_directory_exists(self):
        assert EXAMPLES_DIR.is_dir(), (
            "examples/ directory must exist — add it to the repository root"
        )

    @pytest.mark.parametrize("filename", EXAMPLE_FILES)
    def test_example_file_exists(self, filename):
        assert (EXAMPLES_DIR / filename).is_file(), (
            f"examples/{filename} must exist"
        )


class TestExampleFrontMatter:
    """Each .qmd must open with valid YAML front matter."""

    @pytest.mark.parametrize("filename", EXAMPLE_FILES)
    def test_starts_with_yaml_delimiter(self, filename):
        content = (EXAMPLES_DIR / filename).read_text()
        assert content.startswith("---\n"), (
            f"examples/{filename} must start with a YAML front matter block (---)"
        )

    @pytest.mark.parametrize("filename", EXAMPLE_FILES)
    def test_has_closing_yaml_delimiter(self, filename):
        content = (EXAMPLES_DIR / filename).read_text()
        # The closing --- must appear after the opening ---
        assert "---\n" in content[4:], (
            f"examples/{filename} must have a closing YAML front matter delimiter"
        )

    @pytest.mark.parametrize("filename", EXAMPLE_FILES)
    def test_has_title(self, filename):
        content = (EXAMPLES_DIR / filename).read_text()
        assert "title:" in content, (
            f"examples/{filename} must declare a 'title:' in front matter"
        )


class TestExampleStateChunks:
    """Each example must contain at least one {stata} code chunk."""

    @pytest.mark.parametrize("filename", EXAMPLE_FILES)
    def test_has_stata_chunk(self, filename):
        content = (EXAMPLES_DIR / filename).read_text()
        assert "```{stata}" in content or "```{stata " in content, (
            f"examples/{filename} must contain at least one {{stata}} code chunk"
        )


class TestStateOnlyExample:
    """`stata-only.qmd` must declare a supported Stata execution engine."""

    @pytest.fixture(autouse=True)
    def _content(self):
        self.content = (EXAMPLES_DIR / "stata-only.qmd").read_text()

    def test_uses_knitr_or_nbstata_engine(self):
        has_knitr = "engine: knitr" in self.content
        has_nbstata = "jupyter: nbstata" in self.content
        assert has_knitr or has_nbstata, (
            "stata-only.qmd must declare 'engine: knitr' or 'jupyter: nbstata' "
            "for CLI rendering"
        )

    def test_configures_engine_path_when_knitr(self):
        if "engine: knitr" in self.content:
            assert "engine.path" in self.content, (
                "stata-only.qmd uses knitr but does not configure engine.path "
                "for the Stata executable"
            )


class TestRPolyglotExample:
    """`stata-r-polyglot.qmd` must be a valid R + Stata knitr document."""

    @pytest.fixture(autouse=True)
    def _content(self):
        self.content = (EXAMPLES_DIR / "stata-r-polyglot.qmd").read_text()

    def test_uses_knitr_engine(self):
        assert "engine: knitr" in self.content, (
            "stata-r-polyglot.qmd must use 'engine: knitr'"
        )

    def test_has_r_chunks(self):
        has_r = "```{r}" in self.content or "```{r " in self.content
        assert has_r, "stata-r-polyglot.qmd must contain at least one {r} chunk"

    def test_has_stata_chunks(self):
        has_stata = "```{stata}" in self.content or "```{stata " in self.content
        assert has_stata, (
            "stata-r-polyglot.qmd must contain at least one {stata} chunk"
        )

    def test_configures_engine_path(self):
        assert "engine.path" in self.content, (
            "stata-r-polyglot.qmd must configure engine.path for the Stata executable"
        )


class TestPythonPolyglotExample:
    """`stata-python-polyglot.qmd` must be a valid Python + Stata knitr document."""

    @pytest.fixture(autouse=True)
    def _content(self):
        self.content = (EXAMPLES_DIR / "stata-python-polyglot.qmd").read_text()

    def test_uses_knitr_engine(self):
        assert "engine: knitr" in self.content, (
            "stata-python-polyglot.qmd must use 'engine: knitr'"
        )

    def test_has_python_chunks(self):
        has_python = "```{python}" in self.content or "```{python " in self.content
        assert has_python, (
            "stata-python-polyglot.qmd must contain at least one {python} chunk"
        )

    def test_has_stata_chunks(self):
        has_stata = "```{stata}" in self.content or "```{stata " in self.content
        assert has_stata, (
            "stata-python-polyglot.qmd must contain at least one {stata} chunk"
        )

    def test_configures_engine_path(self):
        assert "engine.path" in self.content, (
            "stata-python-polyglot.qmd must configure engine.path for the Stata executable"
        )

    def test_uses_reticulate_for_python(self):
        assert "reticulate" in self.content, (
            "stata-python-polyglot.qmd must use reticulate to enable Python chunks "
            "in knitr"
        )

    def test_shares_data_via_file(self):
        # Data exchange between Stata and Python must go through a file
        has_csv = ".csv" in self.content
        has_dta = ".dta" in self.content
        assert has_csv or has_dta, (
            "stata-python-polyglot.qmd must document sharing data via a CSV or DTA "
            "file between Stata and Python"
        )


# ===========================================================================
# README — Quarto Integration section
# ===========================================================================

class TestReadmeQuartoSection:
    """The README must contain a complete, accurate Quarto Integration section."""

    @pytest.fixture(autouse=True)
    def _content(self):
        self.content = README_PATH.read_text()

    def test_has_quarto_integration_section(self):
        assert "## Quarto Integration" in self.content, (
            "README must have a dedicated '## Quarto Integration' section"
        )

    def test_documents_stata_chunk_syntax(self):
        assert "```{stata}" in self.content, (
            "README Quarto section must show the {stata} chunk syntax"
        )

    def test_documents_knitr_engine_path(self):
        assert "engine.path" in self.content, (
            "README must document the knitr engine.path configuration"
        )

    def test_documents_r_knitr_prerequisite(self):
        assert "knitr" in self.content, (
            "README must mention the knitr prerequisite for CLI rendering"
        )

    def test_documents_nbstata_path(self):
        assert "nbstata" in self.content, (
            "README must document the nbstata (Jupyter kernel) path for Stata-only "
            "documents without R"
        )

    def test_no_nonstandard_nbkernel_term(self):
        assert "nbkernel" not in self.content, (
            "README must not use the non-standard term 'nbkernel'; "
            "use 'Jupyter execution engine' instead"
        )

    def test_links_to_examples_directory(self):
        assert "examples/" in self.content, (
            "README must link to the examples/ directory"
        )

    def test_covers_positron_native_workflow(self):
        # The README should mention Positron's native rendering path
        content_lower = self.content.lower()
        assert "positron" in content_lower, (
            "README Quarto section must describe the Positron-native rendering path"
        )


# ===========================================================================
# python/requirements.txt
# ===========================================================================

class TestRequirementsFile:
    """The MCP server requirements.txt must only contain MCP server dependencies."""

    @pytest.fixture(autouse=True)
    def _lines(self):
        self.raw = REQUIREMENTS_PATH.read_bytes()
        self.lines = [
            line.strip()
            for line in REQUIREMENTS_PATH.read_text().splitlines()
            if line.strip()
        ]

    # --- packages that must NOT be present -----------------------------------

    def test_no_nbformat(self):
        offenders = [l for l in self.lines if l.startswith("nbformat")]
        assert not offenders, (
            "nbformat must not be in python/requirements.txt. "
            "It is unused by the MCP server and would be installed into the wrong "
            "Python environment for Quarto notebook execution. "
            "Users who need it should install it into their own project venv."
        )

    def test_no_nbclient(self):
        offenders = [l for l in self.lines if l.startswith("nbclient")]
        assert not offenders, (
            "nbclient must not be in python/requirements.txt. "
            "It is unused by the MCP server and would be installed into the wrong "
            "Python environment for Quarto notebook execution. "
            "Users who need it should install it into their own project venv."
        )

    # --- core MCP server packages that must be present -----------------------

    @pytest.mark.parametrize("pkg", ["fastapi", "uvicorn", "mcp", "pydantic", "httpx"])
    def test_has_core_dependency(self, pkg):
        assert any(line.startswith(pkg) for line in self.lines), (
            f"python/requirements.txt must include '{pkg}'"
        )

    # --- file hygiene --------------------------------------------------------

    def test_ends_with_newline(self):
        assert self.raw.endswith(b"\n"), (
            "python/requirements.txt must end with a newline character"
        )

    def test_no_trailing_whitespace(self):
        for i, line in enumerate(REQUIREMENTS_PATH.read_text().splitlines(), 1):
            assert line == line.rstrip(), (
                f"python/requirements.txt line {i} has trailing whitespace: {line!r}"
            )
