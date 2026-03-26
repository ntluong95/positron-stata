import * as vscode from 'vscode';
import * as positron from 'positron';

import { StataServerManager } from './server-manager';
import { stataRuntimeDiscoverer } from './provider';
import { createStataRuntimeMetadata, getStataExtraRuntimeData, getStataRuntimeIconBase64 } from './runtime';
import { StataSession } from './session';
import { ReasonDiscovered, StataInstallation } from './stata-installation';

export class StataRuntimeManager implements positron.LanguageRuntimeManager {
	private readonly _installations = new Map<string, StataInstallation>();
	private readonly _discoveredMetadata: positron.LanguageRuntimeMetadata[] = [];
	private _recommendedRuntime: positron.LanguageRuntimeMetadata | undefined;
	private _discoveryPromise: Promise<void> | undefined;

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _serverManager: StataServerManager,
	) { }

	async recommendedWorkspaceRuntime(): Promise<positron.LanguageRuntimeMetadata | undefined> {
		await this.ensureDiscovery();
		return this._recommendedRuntime;
	}

	async getRecommendedRuntimeMetadata(): Promise<positron.LanguageRuntimeMetadata | undefined> {
		return this.recommendedWorkspaceRuntime();
	}

	async* discoverAllRuntimes(): AsyncGenerator<positron.LanguageRuntimeMetadata> {
		await this.ensureDiscovery();
		for (const metadata of this._discoveredMetadata) {
			yield metadata;
		}
	}

	async createSession(
		runtimeMetadata: positron.LanguageRuntimeMetadata,
		sessionMetadata: positron.RuntimeSessionMetadata,
	): Promise<positron.LanguageRuntimeSession> {
		const installation = this.getOrReconstructInstallation(runtimeMetadata);
		return new StataSession(
			runtimeMetadata,
			sessionMetadata,
			installation,
			this._context.extensionPath,
			this._serverManager,
		);
	}

	async validateMetadata(
		metadata: positron.LanguageRuntimeMetadata,
	): Promise<positron.LanguageRuntimeMetadata> {
		return {
			...metadata,
			base64EncodedIconSvg: getStataRuntimeIconBase64(this._context.extensionPath),
		};
	}

	private async ensureDiscovery(): Promise<void> {
		if (this._discoveryPromise) {
			return this._discoveryPromise;
		}

		this._discoveryPromise = (async () => {
			for await (const installation of stataRuntimeDiscoverer()) {
				const metadata = createStataRuntimeMetadata(installation, this._context.extensionPath);
				this._installations.set(metadata.runtimeId, installation);
				this._discoveredMetadata.push(metadata);
				if (!this._recommendedRuntime || installation.current) {
					this._recommendedRuntime = metadata;
				}
			}
		})();

		await this._discoveryPromise;
	}

	private getOrReconstructInstallation(
		runtimeMetadata: positron.LanguageRuntimeMetadata,
	): StataInstallation {
		const cached = this._installations.get(runtimeMetadata.runtimeId);
		if (cached) {
			return cached;
		}

		const extraData = getStataExtraRuntimeData(runtimeMetadata);
		if (!extraData?.installationPath) {
			throw new Error(`Cannot reconstruct Stata installation from runtime metadata: ${runtimeMetadata.runtimeName}`);
		}

		return {
			id: runtimeMetadata.runtimeId,
			installationPath: extraData.installationPath,
			version: runtimeMetadata.languageVersion || 'unknown',
			edition: (extraData.edition as 'mp' | 'se' | 'be') || 'mp',
			reasonDiscovered: ReasonDiscovered.Configuration,
			current: false,
		};
	}
}
