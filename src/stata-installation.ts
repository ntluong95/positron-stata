import * as crypto from 'crypto';

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

export function inferStataVersionFromPath(installationPath: string): string {
	const match = installationPath.match(/stata(?:now)?[-\s]?(\d{2})/i);
	if (match?.[1]) {
		return match[1];
	}

	const fallback = installationPath.match(/(\d{2})(?!.*\d)/);
	return fallback?.[1] || 'unknown';
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
