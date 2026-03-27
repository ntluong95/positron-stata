import * as vscode from "vscode";
import * as positron from "positron";

import { onDidCompleteStataExecution } from "./autocomplete-events";
import { getStataConfiguration } from "./configuration";
import { StataRuntimeManager } from "./runtime-manager";
import { StataSession } from "./session";

export type VariableRefreshReason = "manual" | "afterRun" | "interval";

export interface StataAutocompleteVariable {
    name: string;
    label?: string;
}

export class StataVariableManager implements vscode.Disposable {
    private readonly _cache = new Map<string, StataAutocompleteVariable[]>();
    private readonly _inFlight = new Map<string, Promise<StataAutocompleteVariable[]>>();
    private readonly _disposables: vscode.Disposable[] = [];
    private _intervalHandle: NodeJS.Timeout | undefined;
    private _lastActiveSessionId: string | undefined;

    constructor(
        private readonly _runtimeManager: StataRuntimeManager,
        private readonly _logger: vscode.LogOutputChannel,
    ) {
        this._disposables.push(
            onDidCompleteStataExecution((event) => {
                if (!getStataConfiguration().autocompleteRefreshAfterRun) {
                    return;
                }

                void this.refreshBySessionId(event.sessionId, "afterRun").catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    this._logger.debug(
                        `Skipped autocomplete variable refresh after run for session ${event.sessionId}: ${message}`,
                    );
                });
            }),
        );
    }

    getVariables(sessionId?: string): string[] {
        return this.getVariableEntries(sessionId).map((variable) => variable.name);
    }

    getVariableEntries(sessionId?: string): StataAutocompleteVariable[] {
        const resolvedSessionId = sessionId || this._lastActiveSessionId;
        if (resolvedSessionId && this._cache.has(resolvedSessionId)) {
            return this._cache.get(resolvedSessionId) || [];
        }

        const firstCached = this._cache.values().next();
        if (!firstCached.done && Array.isArray(firstCached.value)) {
            return firstCached.value;
        }

        return [];
    }

    async getVariablesForForegroundSession(): Promise<string[]> {
        const variables = await this.getVariableEntriesForForegroundSession();
        return variables.map((variable) => variable.name);
    }

    async getVariableEntriesForForegroundSession(): Promise<StataAutocompleteVariable[]> {
        const session = await this.resolveForegroundStataSession(false);
        if (session) {
            this._lastActiveSessionId = session.metadata.sessionId;
            return this.getVariableEntries(session.metadata.sessionId);
        }

        return this.getVariableEntries();
    }

    async refreshForegroundSession(
        reason: VariableRefreshReason,
        ensureSession = false,
    ): Promise<number | undefined> {
        const session = await this.resolveForegroundStataSession(ensureSession);
        if (!session) {
            return undefined;
        }

        const variables = await this.refreshSession(session, reason);
        return variables.length;
    }

    async refreshAllActiveStataSessions(reason: VariableRefreshReason): Promise<void> {
        const activeSessions = await positron.runtime.getActiveSessions();
        const stataSessionIds = activeSessions
            .filter((session) => session.runtimeMetadata.languageId === "stata")
            .map((session) => session.metadata.sessionId);

        for (const sessionId of stataSessionIds) {
            await this.refreshBySessionId(sessionId, reason).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                this._logger.debug(
                    `Could not refresh autocomplete variables for session ${sessionId}: ${message}`,
                );
            });
        }
    }

    reconfigureFromSettings(): void {
        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);
            this._intervalHandle = undefined;
        }

        const configuration = getStataConfiguration();
        if (!configuration.autocompleteVariableRefreshEnabled) {
            return;
        }

        const intervalMs = configuration.autocompleteVariableRefreshIntervalSeconds * 1000;
        this._intervalHandle = setInterval(() => {
            void this.refreshForegroundSession("interval", false).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                this._logger.debug(`Timed autocomplete refresh failed: ${message}`);
            });
        }, intervalMs);

        void this.refreshForegroundSession("interval", false).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            this._logger.debug(`Initial timed autocomplete refresh failed: ${message}`);
        });
    }

    dispose(): void {
        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);
            this._intervalHandle = undefined;
        }

        this._inFlight.clear();
        this._cache.clear();
        this._disposables.forEach((disposable) => disposable.dispose());
        this._disposables.length = 0;
    }

    private async refreshBySessionId(
        sessionId: string,
        reason: VariableRefreshReason,
    ): Promise<StataAutocompleteVariable[]> {
        const session = await this.resolveSessionById(sessionId);
        if (!session) {
            return [];
        }

        return this.refreshSession(session, reason);
    }

    private async refreshSession(
        session: StataSession,
        reason: VariableRefreshReason,
    ): Promise<StataAutocompleteVariable[]> {
        const sessionId = session.metadata.sessionId;
        this._lastActiveSessionId = sessionId;

        const inFlight = this._inFlight.get(sessionId);
        if (inFlight) {
            return inFlight;
        }

        const refreshPromise = this.fetchVariablesFromSession(session, reason)
            .then((variables) => {
                this._cache.set(sessionId, variables);
                return variables;
            })
            .finally(() => {
                this._inFlight.delete(sessionId);
            });

        this._inFlight.set(sessionId, refreshPromise);
        return refreshPromise;
    }

    private async fetchVariablesFromSession(
        session: StataSession,
        reason: VariableRefreshReason,
    ): Promise<StataAutocompleteVariable[]> {
        const variables = await session.listDatasetVariables();
        const normalized = this.normalizeVariableNames(variables);
        this._logger.debug(
            `Autocomplete variable refresh (${reason}) loaded ${normalized.length} variables for session ${session.metadata.sessionId}`,
        );
        return normalized;
    }

    private normalizeVariableNames(
        variableNames: StataAutocompleteVariable[],
    ): StataAutocompleteVariable[] {
        const seen = new Set<string>();
        const normalized: StataAutocompleteVariable[] = [];

        for (const variable of variableNames) {
            const trimmed = variable.name.trim();
            if (!trimmed) {
                continue;
            }

            const key = trimmed.toLowerCase();
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            const label = typeof variable.label === "string" ? variable.label.trim() : "";
            normalized.push({
                name: trimmed,
                label: label || undefined,
            });
        }

        return normalized.sort((left, right) => left.name.localeCompare(right.name));
    }

    private async resolveForegroundStataSession(
        ensureSession: boolean,
    ): Promise<StataSession | undefined> {
        const foregroundSession = await positron.runtime.getForegroundSession();
        if (foregroundSession?.runtimeMetadata.languageId === "stata") {
            return foregroundSession as StataSession;
        }

        const activeSessions = await positron.runtime.getActiveSessions();
        const activeStataSession = activeSessions.find(
            (session) => session.runtimeMetadata.languageId === "stata",
        );

        if (activeStataSession) {
            const resolved = await positron.runtime.getSession(
                activeStataSession.metadata.sessionId,
            );
            return resolved as StataSession | undefined;
        }

        if (!ensureSession) {
            return undefined;
        }

        const runtime = await this._runtimeManager.getRecommendedRuntimeMetadata();
        if (!runtime) {
            return undefined;
        }

        const session = await positron.runtime.startLanguageRuntime(
            runtime.runtimeId,
            runtime.runtimeName,
        );
        return session as StataSession;
    }

    private async resolveSessionById(
        sessionId: string,
    ): Promise<StataSession | undefined> {
        const session = await positron.runtime.getSession(sessionId);
        if (!session || session.runtimeMetadata.languageId !== "stata") {
            return undefined;
        }

        return session as StataSession;
    }
}
