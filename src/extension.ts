import * as vscode from 'vscode';
import * as positron from 'positron';

import { registerCommands } from './commands';
import { getStataConfiguration } from './configuration';
import { registerHelpTopicProvider } from './help';
import { StataRuntimeManager } from './runtime-manager';
import { StataServerManager } from './server-manager';

export const LOGGER = vscode.window.createOutputChannel('Positron Stata MCP', { log: true });

let serverManager: StataServerManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const onDidChangeLogLevel = (logLevel: vscode.LogLevel) => {
		LOGGER.appendLine(`Log level: ${vscode.LogLevel[logLevel]}`);
	};

	context.subscriptions.push(LOGGER.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(LOGGER.logLevel);

	serverManager = new StataServerManager(context, LOGGER);
	const runtimeManager = new StataRuntimeManager(context, serverManager);

	context.subscriptions.push(
		serverManager,
		positron.runtime.registerLanguageRuntimeManager('stata', runtimeManager),
		registerHelpTopicProvider(),
	);

	registerCommands(context, runtimeManager, serverManager);

	if (getStataConfiguration().autoStartServer) {
		void serverManager.warmup();
	}

	LOGGER.info('Positron Stata MCP extension activated');
}

export async function deactivate(): Promise<void> {
	LOGGER.info('Positron Stata MCP extension deactivated');
	await serverManager?.stopServer();
}
