import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { StataEdition } from './configuration';

export enum ReasonDiscovered {
	Configuration = 'Configuration',
	StandardPath = 'Standard Path',
}

export interface StataInstallation {
	id: string;
	installationPath: string;
	version: string;
	edition: StataEdition;
	reasonDiscovered: ReasonDiscovered;
	current: boolean;
}

export function createInstallationId(installationPath: string, edition: StataEdition): string {
	const hash = crypto.createHash('sha256');
	hash.update(installationPath);
	hash.update(edition);
	return hash.digest('hex').slice(0, 16);
}

function normalizeVersion(version: string | undefined): string {
	if (!version) {
		return 'unknown';
	}

	const trimmed = version.trim();
	return trimmed || 'unknown';
}

function versionSpecificity(version: string): number {
	if (!version || version === 'unknown') {
		return 0;
	}

	const numericParts = version.match(/\d+/g) || [];
	return (numericParts.length * 100) + version.length;
}

function extractInfoPlistValue(plistContent: string, key: string): string | undefined {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = plistContent.match(
		new RegExp(`<key>${escapedKey}<\\/key>\\s*<(?:string|integer)>([^<]+)<\\/(?:string|integer)>`, 'i'),
	);
	return match?.[1]?.trim();
}

function readVersionFromInfoPlist(infoPlistPath: string): string | undefined {
	try {
		const plistContent = fs.readFileSync(infoPlistPath, 'utf8');
		return normalizeVersion(
			extractInfoPlistValue(plistContent, 'CFBundleShortVersionString')
			|| extractInfoPlistValue(plistContent, 'CFBundleVersion'),
		);
	} catch {
		return undefined;
	}
}

function collectMacInfoPlistCandidates(installationPath: string): string[] {
	const candidates = new Set<string>();
	const resolvedPath = path.resolve(installationPath);

	const addAppCandidate = (appPath: string): void => {
		if (!appPath.endsWith('.app')) {
			return;
		}
		candidates.add(path.join(appPath, 'Contents', 'Info.plist'));
	};

	let currentPath = resolvedPath;
	while (currentPath && currentPath !== path.dirname(currentPath)) {
		if (path.basename(currentPath).endsWith('.app')) {
			addAppCandidate(currentPath);
		}
		currentPath = path.dirname(currentPath);
	}

	try {
		const stats = fs.statSync(resolvedPath);
		if (stats.isDirectory()) {
			addAppCandidate(resolvedPath);
			for (const entry of fs.readdirSync(resolvedPath)) {
				if (/^stata.*\.app$/i.test(entry)) {
					addAppCandidate(path.join(resolvedPath, entry));
				}
			}
		}
	} catch {
		// Ignore missing or inaccessible paths and fall back to path-only inference.
	}

	return [...candidates];
}

function inferStataVersionFromMacBundle(installationPath: string): string {
	if (process.platform !== 'darwin') {
		return 'unknown';
	}

	let bestVersion = 'unknown';
	for (const infoPlistPath of collectMacInfoPlistCandidates(installationPath)) {
		const version = readVersionFromInfoPlist(infoPlistPath);
		if (versionSpecificity(version || 'unknown') > versionSpecificity(bestVersion)) {
			bestVersion = normalizeVersion(version);
		}
	}

	return bestVersion;
}

export function inferStataVersionFromPath(installationPath: string): string {
	const detailedMatch = installationPath.match(/(\d+(?:\.\d+)+)(?!.*\d)/);
	if (detailedMatch?.[1]) {
		return detailedMatch[1];
	}

	const match = installationPath.match(/stata(?:now)?[-\s]?(\d{2})/i);
	if (match?.[1]) {
		return match[1];
	}

	const fallback = installationPath.match(/(\d{2})(?!.*\d)/);
	return fallback?.[1] || 'unknown';
}

export function inferStataVersion(installationPath: string): string {
	const pathVersion = inferStataVersionFromPath(installationPath);
	const macBundleVersion = inferStataVersionFromMacBundle(installationPath);
	return versionSpecificity(macBundleVersion) > versionSpecificity(pathVersion)
		? macBundleVersion
		: pathVersion;
}

export function inferEditionFromPath(
	installationPath: string,
	configuredEdition: StataEdition,
): StataEdition {
	if (configuredEdition) {
		return configuredEdition;
	}

	if (/mp/i.test(installationPath)) {
		return 'mp';
	}
	if (/se/i.test(installationPath)) {
		return 'se';
	}
	if (/be/i.test(installationPath)) {
		return 'be';
	}
	return 'mp';
}
