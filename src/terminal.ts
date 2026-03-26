import * as vscode from "vscode";

interface BannerColors {
  prompt: string;
  cmd: string;
  err: string;
  errBg: string;
  table: string;
  dim: string;
  bold: string;
  reset: string;
}

function hexToAnsi(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16) || 0;
  const g = parseInt(normalized.substring(2, 4), 16) || 0;
  const b = parseInt(normalized.substring(4, 6), 16) || 0;
  return `\u001b[38;2;${r};${g};${b}m`;
}

function loadColors(useAnsi: boolean): BannerColors {
  if (!useAnsi) {
    return {
      prompt: "",
      cmd: "",
      err: "",
      errBg: "",
      table: "",
      dim: "",
      bold: "",
      reset: "",
    };
  }

  const cfg = vscode.workspace.getConfiguration("stata.colors");
  return {
    prompt: hexToAnsi(cfg.get<string>("prompt", "#4E9A6A")),
    cmd: hexToAnsi(cfg.get<string>("command", "#569CD6")),
    err: hexToAnsi(cfg.get<string>("error", "#CC3E44")),
    errBg: hexToAnsi(cfg.get<string>("error", "#CC3E44")),
    table: hexToAnsi(cfg.get<string>("tableSeparator", "#B4B4B4")),
    dim: hexToAnsi(cfg.get<string>("dim", "#787878")),
    bold: "\u001b[1m",
    reset: "\u001b[0m",
  };
}

export function buildStataConsoleBanner(useAnsi = true): string {
  const colors = loadColors(useAnsi);

  return (
    `\r\n` +
    `${colors.cmd}  ___  ____  ____  ____  ____ \xAE${colors.reset}\r\n` +
    `${colors.cmd} /__    /   ____/   /   ____/${colors.reset}\r\n` +
    `${colors.cmd} ___/   /   /___/   /   /___/${colors.reset}   ${colors.bold}Stata Console${colors.reset}\r\n` +
    `\r\n` +
    `${colors.cmd} Positron-native session backed by the Stata MCP server.${colors.reset}\r\n\r\n`
  );
}
