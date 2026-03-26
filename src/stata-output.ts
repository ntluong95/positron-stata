import { GraphDescriptor } from './server-client';

const GRAPH_SECTION_REGEX = /={60}\nGRAPHS DETECTED: (\d+) graph\(s\) created\n={60}\n((?:\s*•\s+.+\n?)+)/;

export function normalizeOutput(output: string): string {
	return output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseGraphsFromOutput(output: string): GraphDescriptor[] {
	const graphs: GraphDescriptor[] = [];
	const match = normalizeOutput(output).match(GRAPH_SECTION_REGEX);
	if (!match) {
		return graphs;
	}

	for (const line of match[2].trim().split('\n')) {
		const graphMatch = line.match(/•\s+([^:]+):\s+([^\n\[]+?)(?:\s*\[CMD:.*\])?$/);
		if (!graphMatch) {
			continue;
		}
		graphs.push({
			name: graphMatch[1].trim(),
			path: graphMatch[2].trim().replace(/\\/g, '/'),
		});
	}

	return graphs;
}

export function stripGraphMetadata(output: string): string {
	return normalizeOutput(output).replace(GRAPH_SECTION_REGEX, '').trim();
}

export function isStatusLine(message: string): boolean {
	return message.startsWith('Starting execution')
		|| message.startsWith('Executing selection')
		|| message.startsWith('*** Execution');
}

export function isGraphMetadataLine(message: string): boolean {
	return message.startsWith('============================================================')
		|| message.startsWith('GRAPHS DETECTED:')
		|| /^\s*•\s+/.test(message);
}
