import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getStataConfiguration } from './configuration';
import {
	createInstallationId,
	inferEditionFromPath,
	inferStataVersion,
	ReasonDiscovered,
	StataInstallation,
} from './stata-installation';

function normalizeCandidate(candidate: string): string {
	return candidate.replace(/[\\\/]+$/, '');
}

function installationFromCandidate(
	candidate: string,
	reasonDiscovered: ReasonDiscovered,
	current: boolean,
): StataInstallation | undefined {
	const normalized = normalizeCandidate(candidate);
	if (!normalized || !fs.existsSync(normalized)) {
		return undefined;
	}

	const configuration = getStataConfiguration();
	const edition = inferEditionFromPath(normalized, configuration.edition);

	return {
		id: createInstallationId(normalized, edition),
		installationPath: normalized,
		version: inferStataVersion(normalized),
		edition,
		reasonDiscovered,
		current,
	};
}

function standardInstallCandidates(): string[] {
	if (process.platform === 'win32') {
		const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
		const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
		return [
			path.join(programFiles, 'Stata19'),
			path.join(programFiles, 'Stata18'),
			path.join(programFiles, 'Stata17'),
			path.join(programFilesX86, 'Stata19'),
			path.join(programFilesX86, 'Stata18'),
			path.join(programFilesX86, 'Stata17'),
		];
	}

	if (process.platform === 'darwin') {
		return [
			'/Applications/StataNow',
			'/Applications/Stata19',
			'/Applications/Stata18',
			'/Applications/Stata17',
			'/Applications/Stata',
		];
	}

	return [
		'/usr/local/stata19',
		'/usr/local/stata18',
		'/usr/local/stata17',
		'/usr/local/stata',
		path.join(os.homedir(), 'stata19'),
		path.join(os.homedir(), 'stata18'),
		path.join(os.homedir(), 'stata17'),
	];
}

export async function* stataRuntimeDiscoverer(): AsyncGenerator<StataInstallation> {
	const configuration = getStataConfiguration();
	const discovered = new Set<string>();

	const maybeYield = async function* (
		candidate: string,
		reasonDiscovered: ReasonDiscovered,
		current: boolean,
	): AsyncGenerator<StataInstallation> {
		const installation = installationFromCandidate(candidate, reasonDiscovered, current);
		if (!installation || discovered.has(installation.id)) {
			return;
		}

		discovered.add(installation.id);
		yield installation;
	};

	if (configuration.installationPath) {
		yield* maybeYield(configuration.installationPath, ReasonDiscovered.Configuration, true);
	}

	for (const candidate of standardInstallCandidates()) {
		yield* maybeYield(candidate, ReasonDiscovered.StandardPath, false);
	}
}

export async function getPreferredStataInstallation(): Promise<StataInstallation | undefined> {
	for await (const installation of stataRuntimeDiscoverer()) {
		return installation;
	}
	return undefined;
}
