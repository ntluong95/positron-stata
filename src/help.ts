import * as vscode from 'vscode';
import * as positron from 'positron';

const HELP_TOPIC_SELECTOR: vscode.DocumentSelector = [
	{ language: 'stata', scheme: 'file' },
	{ language: 'stata', scheme: 'untitled' },
	{ language: 'stata', scheme: 'inmemory' },
];

export function parseHelpCommand(code: string): string | null {
	const trimmed = code.trim();
	if (!trimmed || trimmed.includes('\n')) {
		return null;
	}

	const match = trimmed.match(/^\s*(h(e(l(p)?)?)?|man|ch(e(l(p)?)?)?|wh(e(l(p)?)?)?)\s+(.+)$/i);
	if (!match) {
		return null;
	}

	let topic = match[11].trim();
	topic = topic.replace(/,.*$/, '').trim();
	topic = topic.replace(/^#/, '');
	topic = topic.replace(/\s+/g, '_');
	return topic || null;
}

class StataHelpTopicProvider implements positron.HelpTopicProvider {
	async provideHelpTopic(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
	): Promise<string> {
		if (token.isCancellationRequested || document.languageId !== 'stata') {
			return '';
		}

		const lineText = document.lineAt(position.line).text;
		const topic = this.extractTopicAt(lineText, position.character);
		return topic ?? '';
	}

	private extractTopicAt(lineText: string, character: number): string | undefined {
		if (!lineText) {
			return undefined;
		}

		const isTopicCharacter = (value: string) => /[A-Za-z0-9_#.\-]/.test(value);
		const index = Math.max(0, Math.min(character, Math.max(0, lineText.length - 1)));
		const candidates = index === 0 ? [index] : [index, index - 1];

		for (const candidate of candidates) {
			if (!isTopicCharacter(lineText[candidate])) {
				continue;
			}

			let start = candidate;
			while (start > 0 && isTopicCharacter(lineText[start - 1])) {
				start--;
			}

			let end = candidate + 1;
			while (end < lineText.length && isTopicCharacter(lineText[end])) {
				end++;
			}

			const topic = lineText.slice(start, end).replace(/^#/, '').trim();
			if (topic) {
				return topic;
			}
		}

		return undefined;
	}
}

export function registerHelpTopicProvider(): vscode.Disposable {
	return positron.languages.registerHelpTopicProvider(
		HELP_TOPIC_SELECTOR,
		new StataHelpTopicProvider(),
	);
}
