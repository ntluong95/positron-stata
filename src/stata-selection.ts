export interface StataBlockBounds {
	startLine: number;
	endLine: number;
}

interface LineAnalysis {
	continues: boolean;
	executable: boolean;
	firstExecutableCharacter: number;
}

export interface StataExecutablePosition {
	line: number;
	character: number;
}

function analyzeLine(line: string, startsInBlockComment: boolean): { analysis: LineAnalysis; endsInBlockComment: boolean } {
	let inBlockComment = startsInBlockComment;
	let inString = false;
	let hasExecutableCode = false;
	let firstExecutableCharacter = -1;

	for (let index = 0; index < line.length; index += 1) {
		const current = line[index];
		const nextTwo = line.slice(index, index + 2);
		const nextThree = line.slice(index, index + 3);

		if (inBlockComment) {
			if (nextTwo === '*/') {
				inBlockComment = false;
				index += 1;
			}
			continue;
		}

		if (inString) {
			if (current === '"') {
				if (line[index + 1] === '"') {
					index += 1;
					continue;
				}

				inString = false;
			}
			continue;
		}

		if (!hasExecutableCode && /\s/.test(current)) {
			continue;
		}

		if (!hasExecutableCode && current === '*') {
			return {
				analysis: { continues: false, executable: false, firstExecutableCharacter: -1 },
				endsInBlockComment: false,
			};
		}

		if (nextThree === '///') {
			return {
				analysis: {
					continues: hasExecutableCode,
					executable: hasExecutableCode,
					firstExecutableCharacter,
				},
				endsInBlockComment: false,
			};
		}

		if (nextTwo === '//') {
			return {
				analysis: {
					continues: false,
					executable: hasExecutableCode,
					firstExecutableCharacter,
				},
				endsInBlockComment: false,
			};
		}

		if (nextTwo === '/*') {
			inBlockComment = true;
			index += 1;
			continue;
		}

		if (current === '"') {
			inString = true;
			firstExecutableCharacter = hasExecutableCode ? firstExecutableCharacter : index;
			hasExecutableCode = true;
			continue;
		}

		firstExecutableCharacter = hasExecutableCode ? firstExecutableCharacter : index;
		hasExecutableCode = true;
	}

	return {
		analysis: {
			continues: false,
			executable: hasExecutableCode,
			firstExecutableCharacter,
		},
		endsInBlockComment: inBlockComment,
	};
}

function analyzeLines(lines: readonly string[]): LineAnalysis[] {
	const analyses: LineAnalysis[] = [];
	let inBlockComment = false;

	for (const line of lines) {
		const { analysis, endsInBlockComment } = analyzeLine(line, inBlockComment);
		analyses.push(analysis);
		inBlockComment = endsInBlockComment;
	}

	return analyses;
}

export function getStataBlockBounds(lines: readonly string[], activeLine: number): StataBlockBounds {
	if (lines.length === 0) {
		return { startLine: 0, endLine: 0 };
	}

	const safeActiveLine = Math.max(0, Math.min(activeLine, lines.length - 1));
	const analyses = analyzeLines(lines);

	let startLine = safeActiveLine;
	while (startLine > 0 && analyses[startLine - 1].continues) {
		startLine -= 1;
	}

	let endLine = safeActiveLine;
	while (endLine < lines.length - 1 && analyses[endLine].continues) {
		endLine += 1;
	}

	return { startLine, endLine };
}

export function getNextStataExecutableLine(lines: readonly string[], afterLine: number): number | undefined {
	const position = getNextStataExecutablePosition(lines, afterLine);
	return position?.line;
}

export function getNextStataExecutablePosition(lines: readonly string[], afterLine: number): StataExecutablePosition | undefined {
	if (lines.length === 0) {
		return undefined;
	}

	const analyses = analyzeLines(lines);
	const startLine = Math.max(afterLine + 1, 0);

	for (let lineNumber = startLine; lineNumber < analyses.length; lineNumber += 1) {
		if (analyses[lineNumber].executable) {
			return {
				line: lineNumber,
				character: Math.max(analyses[lineNumber].firstExecutableCharacter, 0),
			};
		}
	}

	return undefined;
}
