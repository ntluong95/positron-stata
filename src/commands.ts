import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import * as positron from 'positron';

import { getWorkingDirectoryForFile } from './configuration';
import { StataRuntimeManager } from './runtime-manager';
import { StataServerManager } from './server-manager';
import { StataSession } from './session';

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

function getSelectionOrCurrentLine(editor: vscode.TextEditor): string {
	if (!editor.selection.isEmpty) {
		return editor.document.getText(editor.selection);
	}
	return editor.document.lineAt(editor.selection.active.line).text;
}

export function registerCommands(
	context: vscode.ExtensionContext,
	runtimeManager: StataRuntimeManager,
	serverManager: StataServerManager,
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

			const code = getSelectionOrCurrentLine(editor).trim();
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
