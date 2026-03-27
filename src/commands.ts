import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import * as positron from 'positron';

import { getWorkingDirectoryForFile } from './configuration';
import { StataRuntimeManager } from './runtime-manager';
import { StataServerManager } from './server-manager';
import { StataSession } from './session';
import { getNextStataExecutablePosition, getStataBlockBounds } from './stata-selection';
import { StataVariableManager } from './variable-manager';

interface EditorCommandTarget {
	code: string;
	endLine: number;
}

async function getOrStartStataSession(
	runtimeManager: StataRuntimeManager,
): Promise<StataSession | undefined> {
	const foregroundSession = await positron.runtime.getForegroundSession();
	if (foregroundSession?.runtimeMetadata.languageId === 'stata') {
		return foregroundSession as StataSession;
	}

	const activeSessions = await positron.runtime.getActiveSessions();
	const activeStataSession = activeSessions.find(session => session.runtimeMetadata.languageId === 'stata');
	if (activeStataSession) {
		positron.runtime.focusSession(activeStataSession.metadata.sessionId);
		const resolved = await positron.runtime.getSession(activeStataSession.metadata.sessionId);
		return resolved as StataSession | undefined;
	}

	const runtime = await runtimeManager.getRecommendedRuntimeMetadata();
	if (!runtime) {
		vscode.window.showErrorMessage('No Stata runtime is available. Set positron.stata.installationPath first.');
		return undefined;
	}

	const session = await positron.runtime.startLanguageRuntime(runtime.runtimeId, runtime.runtimeName);
	return session as StataSession;
}

function isStataEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
	if (!editor) {
		return false;
	}

	if (editor.document.languageId === 'stata') {
		return true;
	}

	return /\.(do|ado|doh|mata)$/i.test(editor.document.uri.fsPath);
}

function getDocumentLines(document: vscode.TextDocument): string[] {
	return Array.from({ length: document.lineCount }, (_, lineNumber) => (
		document.lineAt(lineNumber).text
	));
}

function getSelectionEndLine(selection: vscode.Selection): number {
	if (
		selection.end.character === 0
		&& selection.end.line > selection.start.line
	) {
		return selection.end.line - 1;
	}

	return selection.end.line;
}

function getSelectionOrCurrentCommand(editor: vscode.TextEditor, lines: readonly string[]): EditorCommandTarget {
	if (!editor.selection.isEmpty) {
		return {
			code: editor.document.getText(editor.selection),
			endLine: getSelectionEndLine(editor.selection),
		};
	}

	const { startLine, endLine } = getStataBlockBounds(lines, editor.selection.active.line);
	const start = new vscode.Position(startLine, 0);
	const end = editor.document.lineAt(endLine).range.end;
	return {
		code: editor.document.getText(new vscode.Range(start, end)),
		endLine,
	};
}

function moveCursor(editor: vscode.TextEditor, lineNumber: number, character: number): void {
	const position = new vscode.Position(lineNumber, character);
	editor.selection = new vscode.Selection(position, position);
	editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function toggleAutocompleteAutoRefreshSetting(): Promise<boolean> {
	const activeResource = vscode.window.activeTextEditor?.document.uri;
	const config = vscode.workspace.getConfiguration('positron.stata', activeResource);
	const settingKey = 'autocomplete.variableRefresh.enabled';
	const current = config.get<boolean>(settingKey, false) === true;
	const nextValue = !current;

	const inspection = config.inspect<boolean>(settingKey);
	let target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global;
	if (inspection?.workspaceFolderValue !== undefined) {
		target = vscode.ConfigurationTarget.WorkspaceFolder;
	} else if (inspection?.workspaceValue !== undefined) {
		target = vscode.ConfigurationTarget.Workspace;
	}

	await config.update(settingKey, nextValue, target);
	return nextValue;
}

async function executeEditorCommand(
	editor: vscode.TextEditor,
	context: vscode.ExtensionContext,
	runtimeManager: StataRuntimeManager,
	advanceToNextBlock: boolean,
): Promise<void> {
	const lines = getDocumentLines(editor.document);
	const commandTarget = getSelectionOrCurrentCommand(editor, lines);
	const code = commandTarget.code.trim();
	if (!code) {
		return;
	}

	const session = await getOrStartStataSession(runtimeManager);
	if (!session) {
		return;
	}

	const workingDirectory = getWorkingDirectoryForFile(editor.document.uri.fsPath, context.extensionPath);
	if (workingDirectory) {
		await session.setWorkingDirectory(workingDirectory);
	}

	session.execute(
		code,
		randomUUID(),
		positron.RuntimeCodeExecutionMode.Interactive,
		positron.RuntimeErrorBehavior.Continue,
	);

	if (!advanceToNextBlock) {
		return;
	}

	const nextPosition = getNextStataExecutablePosition(lines, commandTarget.endLine);
	if (nextPosition) {
		moveCursor(editor, nextPosition.line, nextPosition.character);
	}
}

export function registerCommands(
	context: vscode.ExtensionContext,
	runtimeManager: StataRuntimeManager,
	serverManager: StataServerManager,
	variableManager: StataVariableManager,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.createNewFile', async () => {
			const untitledUri = vscode.Uri.parse('untitled:Untitled.do');
			const document = await vscode.workspace.openTextDocument(untitledUri);
			const stataDocument = await vscode.languages.setTextDocumentLanguage(document, 'stata');
			await vscode.window.showTextDocument(stataDocument);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.runSelection', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!isStataEditor(editor)) {
				vscode.window.showWarningMessage('Open a Stata source file to run code.');
				return;
			}

			await executeEditorCommand(editor, context, runtimeManager, false);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.runSelectionAndAdvance', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!isStataEditor(editor)) {
				vscode.window.showWarningMessage('Open a Stata source file to run code.');
				return;
			}

			await executeEditorCommand(editor, context, runtimeManager, true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.runFile', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!isStataEditor(editor)) {
				vscode.window.showWarningMessage('Open a Stata source file to run the current file.');
				return;
			}

			await editor.document.save();
			const session = await getOrStartStataSession(runtimeManager);
			if (!session) {
				return;
			}

			await session.runFile(editor.document.uri.fsPath);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.stopExecution', async () => {
			const session = await getOrStartStataSession(runtimeManager);
			await session?.interrupt();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.restartSession', async () => {
			const session = await getOrStartStataSession(runtimeManager);
			await session?.restart();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.viewData', async () => {
			const session = await getOrStartStataSession(runtimeManager);
			if (!session) {
				return;
			}

			await session.showDataViewer();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.refreshAutocompleteVariables', async () => {
			try {
				const count = await variableManager.refreshForegroundSession('manual', true);
				if (count === undefined) {
					vscode.window.showWarningMessage('No Stata session is available to refresh autocomplete variables.');
					return;
				}

				vscode.window.showInformationMessage(`Refreshed Stata autocomplete variables (${count} found).`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to refresh Stata autocomplete variables: ${message}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.toggleAutocompleteAutoRefresh', async () => {
			try {
				const enabled = await toggleAutocompleteAutoRefreshSetting();
				if (enabled) {
					await variableManager.refreshForegroundSession('manual', false);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to toggle autocomplete auto-refresh: ${message}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.testServerConnection', async () => {
			const session = await getOrStartStataSession(runtimeManager);
			if (!session) {
				return;
			}

			try {
				const result = await session.testConnection();
				vscode.window.showInformationMessage(result || 'Stata MCP server is responding.');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Stata MCP server test failed: ${message}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('positronStata.showLogs', () => {
			serverManager.showLogs();
		}),
	);
}
