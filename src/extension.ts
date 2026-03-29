import * as vscode from "vscode";
import * as positron from "positron";

import { registerCommands } from "./commands";
import { StataCompletionProvider } from "./completionProvider";
import { getStataConfiguration } from "./configuration";
import { registerHelpTopicProvider } from "./help";
import { StataHoverProvider } from "./hoverProvider";
import { StataOutlineProvider } from "./outlineProvider";
import { StataRuntimeManager } from "./runtime-manager";
import { StataServerManager } from "./server-manager";
import { StataVariableManager } from "./variable-manager";

export const LOGGER = vscode.window.createOutputChannel(
  "Positron PyStata Server",
  { log: true },
);

let serverManager: StataServerManager | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const stataDocumentSelector: vscode.DocumentSelector = [
    { language: "stata", scheme: "file" },
    { language: "stata", scheme: "untitled" },
  ];

  const onDidChangeLogLevel = (logLevel: vscode.LogLevel) => {
    LOGGER.appendLine(`Log level: ${vscode.LogLevel[logLevel]}`);
  };

  context.subscriptions.push(LOGGER.onDidChangeLogLevel(onDidChangeLogLevel));
  onDidChangeLogLevel(LOGGER.logLevel);

  serverManager = new StataServerManager(context, LOGGER);
  const runtimeManager = new StataRuntimeManager(context, serverManager);
  const variableManager = new StataVariableManager(runtimeManager, LOGGER);

  context.subscriptions.push(
    serverManager,
    variableManager,
    positron.runtime.registerLanguageRuntimeManager("stata", runtimeManager),
    vscode.languages.registerCompletionItemProvider(
      stataDocumentSelector,
      new StataCompletionProvider(variableManager),
    ),
    vscode.languages.registerHoverProvider(
      stataDocumentSelector,
      new StataHoverProvider(),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      stataDocumentSelector,
      new StataOutlineProvider(),
    ),
    registerHelpTopicProvider(),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("positron.stata.autocomplete")) {
        variableManager.reconfigureFromSettings();
      }
    }),
  );

  registerCommands(context, runtimeManager, serverManager, variableManager);
  variableManager.reconfigureFromSettings();

  if (getStataConfiguration().autoStartServer) {
    void serverManager.warmup();
  }

  LOGGER.info("Positron PyStata Server extension activated");
}

export async function deactivate(): Promise<void> {
  LOGGER.info("Positron PyStata Server extension deactivated");
  await serverManager?.stopServer();
}
