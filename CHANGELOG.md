# Changelog

All notable changes to `positron-stata` are documented in this file.

## 0.0.7

- Added an editor actions-left toggle control to turn autocomplete variable auto-refresh on/off for Stata editors
- Added `positronStata.toggleAutocompleteAutoRefresh` command to flip `positron.stata.autocomplete.variableRefresh.enabled`

## 0.0.6

- Added official Stata command highlighting with abbreviation support via dedicated `official-commands` patterns
- Added SSC community command highlighting via dedicated `community-commands` patterns
- Added Mata block and inline highlighting with expanded Mata internals and common Mata function scopes

## 0.0.5

- Added an editor title run dropdown with Run Selection, and Run Current File actions
- Made Run Selection or Current Line the primary play button action with Ctrl/Cmd+Enter

## 0.0.4

- Added Stata command auto-completion provider with descriptions and command aliases
- Added Stata snippet contribution with 19 reusable do-file templates
- Added Stata hover help provider for common commands
- Added do-file outline symbols for sections, program definitions, and loop blocks

## 0.0.3

- Preserve column alignment for streamed output (SSE parser fix)

## 0.0.2

- Support run multi-line command

## 0.0.1

- Positron-native extension shell based on the runtime/session architecture
- Stata runtime discovery, session creation, server lifecycle management, and command wiring for Positron
- Positron integration for Stata help and data preview
- Positron Plots integration for graph export produced by the preserved Python server
- Updated project metadata, command IDs, configuration namespace, packaging scripts, and branding for `positron-stata`
