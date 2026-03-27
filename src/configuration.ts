import * as path from 'path';
import * as vscode from 'vscode';

export type StataEdition = 'mp' | 'se' | 'be';
export type WorkingDirectoryMode = 'dofile' | 'parent' | 'workspace' | 'extension' | 'custom' | 'none';
export type ResultDisplayMode = 'compact' | 'full';

export interface StataConfiguration {
	installationPath: string;
	edition: StataEdition;
	serverHost: string;
	serverPort: number;
	autoStartServer: boolean;
	forcePort: boolean;
	debug: boolean;
	autoDisplayGraphs: boolean;
	runSelectionTimeout: number;
	runFileTimeout: number;
	workingDirectoryMode: WorkingDirectoryMode;
	customWorkingDirectory: string;
	resultDisplayMode: ResultDisplayMode;
	maxOutputTokens: number;
	multiSession: boolean;
	maxSessions: number;
	sessionTimeout: number;
	dataViewerMaxRows: number;
	autocompleteRefreshAfterRun: boolean;
	autocompleteVariableRefreshEnabled: boolean;
	autocompleteVariableRefreshIntervalSeconds: number;
}

function normalizePath(value: string): string {
	return value.trim().replace(/[\\\/]+$/, '');
}

function asPositiveInteger(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return Math.trunc(value);
}

export function getStataConfiguration(): StataConfiguration {
	const config = vscode.workspace.getConfiguration('positron.stata');
	const edition = (config.get<string>('edition', 'mp') || 'mp').toLowerCase();

	return {
		installationPath: normalizePath(config.get<string>('installationPath', '') || ''),
		edition: edition === 'se' || edition === 'be' ? edition : 'mp',
		serverHost: (config.get<string>('server.host', 'localhost') || 'localhost').trim() || 'localhost',
		serverPort: asPositiveInteger(config.get<number>('server.port', 4000), 4000),
		autoStartServer: config.get<boolean>('server.autoStart', true) !== false,
		forcePort: config.get<boolean>('server.forcePort', false) === true,
		debug: config.get<boolean>('debug', false) === true,
		autoDisplayGraphs: config.get<boolean>('autoDisplayGraphs', true) !== false,
		runSelectionTimeout: asPositiveInteger(config.get<number>('runSelectionTimeout', 600), 600),
		runFileTimeout: asPositiveInteger(config.get<number>('runFileTimeout', 600), 600),
		workingDirectoryMode: (config.get<WorkingDirectoryMode>('workingDirectory.mode', 'dofile') || 'dofile'),
		customWorkingDirectory: normalizePath(config.get<string>('workingDirectory.customPath', '') || ''),
		resultDisplayMode: (config.get<ResultDisplayMode>('mcp.resultDisplayMode', 'compact') || 'compact') === 'full'
			? 'full'
			: 'compact',
		maxOutputTokens: Math.max(0, asPositiveInteger(config.get<number>('mcp.maxOutputTokens', 10000), 10000)),
		multiSession: config.get<boolean>('multiSession.enabled', true) !== false,
		maxSessions: asPositiveInteger(config.get<number>('multiSession.maxSessions', 100), 100),
		sessionTimeout: asPositiveInteger(config.get<number>('multiSession.sessionTimeout', 3600), 3600),
		dataViewerMaxRows: Math.max(100, asPositiveInteger(config.get<number>('dataViewer.maxRows', 100000), 100000)),
		autocompleteRefreshAfterRun: config.get<boolean>('autocomplete.refreshAfterRun', true) !== false,
		autocompleteVariableRefreshEnabled: config.get<boolean>('autocomplete.variableRefresh.enabled', false) === true,
		autocompleteVariableRefreshIntervalSeconds: Math.max(
			5,
			asPositiveInteger(config.get<number>('autocomplete.variableRefresh.intervalSeconds', 30), 30),
		),
	};
}

export function getWorkingDirectoryForFile(
	filePath: string,
	extensionPath: string,
	configuration: StataConfiguration = getStataConfiguration(),
): string | undefined {
	const fileDirectory = path.dirname(filePath);

	switch (configuration.workingDirectoryMode) {
		case 'dofile':
			return fileDirectory;
		case 'parent':
			return path.dirname(fileDirectory);
		case 'workspace': {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
			return workspaceFolder?.uri.fsPath || fileDirectory;
		}
		case 'extension':
			return path.join(extensionPath, 'logs');
		case 'custom':
			return configuration.customWorkingDirectory || fileDirectory;
		case 'none':
			return undefined;
		default:
			return fileDirectory;
	}
}
