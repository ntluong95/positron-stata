import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as positron from "positron";

import {
  getStataConfiguration,
  getWorkingDirectoryForFile,
} from "./configuration";
import { parseHelpCommand } from "./help";
import {
  DataViewResponse,
  StataServerClient,
  GraphDescriptor,
  isStreamAbortError,
  StreamingRequest,
} from "./server-client";
import { StataServerManager } from "./server-manager";
import {
  isGraphMetadataLine,
  isStatusLine,
  parseGraphsFromOutput,
  stripGraphMetadata,
} from "./stata-output";
import { StataInstallation } from "./stata-installation";
import { StataDataExplorer } from "./data-explorer";
import { StataHelpServer } from "./help-server";
import { buildStataConsoleBanner } from "./terminal";

interface RuntimeResourceUsage {
  [key: string]: unknown;
}

interface StataRuntimeVariable extends positron.RuntimeVariable {
  kind?: "number" | "string" | "table" | "other";
  has_viewer?: boolean;
  is_truncated?: boolean;
  updated_time?: number;
}

interface VariableListPayload {
  variables: StataRuntimeVariable[];
  length: number;
  version: number;
}

interface VariableChildrenPayload {
  children: StataRuntimeVariable[];
  length: number;
}

interface UiWorkingDirectoryParams {
  directory: string;
}

interface VariablesClearParams {
  include_hidden_objects?: boolean;
}

interface VariablesDeleteParams {
  names?: string[];
}

const DATASET_ACCESS_KEY = "__stata_dataset__";
const COLUMN_ACCESS_KEY_PREFIX = "column:";
const DATASET_VARIABLE_PATH = [DATASET_ACCESS_KEY];

function aliasHome(directory: string): string {
  if (!directory) {
    return "";
  }

  const home = os.homedir();
  if (!home) {
    return directory;
  }

  const directoryCompare =
    process.platform === "win32" ? directory.toLowerCase() : directory;
  const homeCompare =
    process.platform === "win32" ? home.toLowerCase() : home;

  if (directoryCompare === homeCompare) {
    return "~";
  }

  if (
    directoryCompare.startsWith(`${homeCompare}/`) ||
    directoryCompare.startsWith(`${homeCompare}\\`)
  ) {
    return `~${directory.slice(home.length)}`;
  }

  return directory;
}

/**
 * Parse a `browse` or `br` command, returning the if-condition (or empty
 * string for an unfiltered browse). Returns `null` when the input is not a
 * browse command.
 */
function parseBrowseCommand(code: string): string | null {
  const match = code.match(
    /^\s*(br(o(w(se?)?)?)?)\s*(?:if\s+(.+))?$/i,
  );
  if (!match) {
    return null;
  }
  return (match[5] ?? "").trim();
}

function parseChangeDirectoryCommand(code: string): string | null {
  const relevantLine = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("*") && !line.startsWith("//"))
    .pop();

  if (!relevantLine) {
    return null;
  }

  const match = relevantLine.match(/^(?:cap(?:ture)?\s+)?cd\s+(.+)$/i);
  if (!match?.[1]) {
    return null;
  }

  return match[1].trim();
}

export class StataSession
  implements positron.LanguageRuntimeSession, vscode.Disposable
{
  private readonly _messageEmitter =
    new vscode.EventEmitter<positron.LanguageRuntimeMessage>();
  private readonly _stateEmitter =
    new vscode.EventEmitter<positron.RuntimeState>();
  private readonly _exitEmitter =
    new vscode.EventEmitter<positron.LanguageRuntimeExit>();
  private readonly _resourceUsageEmitter =
    new vscode.EventEmitter<RuntimeResourceUsage>();
  private readonly _clients = new Map<string, positron.RuntimeClientType>();
  private _runtimeInfo: positron.LanguageRuntimeInfo | undefined;
  private _activeRequest:
    | { executionId: string; request: StreamingRequest }
    | undefined;
  private _workingDirectory: string | undefined;
  private _lastReportedWorkingDirectory: string | undefined;
  private _executionCount = 0;
  private _variablesVersion = 0;
  private readonly _dataExplorers = new Map<string, StataDataExplorer>();
  private _activeDataExplorer: StataDataExplorer | undefined;
  private readonly _helpServer = new StataHelpServer();

  readonly onDidReceiveRuntimeMessage: vscode.Event<positron.LanguageRuntimeMessage> =
    this._messageEmitter.event;
  readonly onDidChangeRuntimeState: vscode.Event<positron.RuntimeState> =
    this._stateEmitter.event;
  readonly onDidEndSession: vscode.Event<positron.LanguageRuntimeExit> =
    this._exitEmitter.event;
  readonly onDidUpdateResourceUsage: vscode.Event<RuntimeResourceUsage> =
    this._resourceUsageEmitter.event;

  public dynState: positron.LanguageRuntimeDynState;

  constructor(
    readonly runtimeMetadata: positron.LanguageRuntimeMetadata,
    readonly metadata: positron.RuntimeSessionMetadata,
    private readonly _installation: StataInstallation,
    private readonly _extensionPath: string,
    private readonly _serverManager: StataServerManager,
  ) {
    this.dynState = {
      sessionName: runtimeMetadata.runtimeName,
      inputPrompt: ".",
      continuationPrompt: ">",
    };
    this._workingDirectory = this.resolveInitialWorkingDirectory();
  }

  get runtimeInfo(): positron.LanguageRuntimeInfo | undefined {
    return this._runtimeInfo;
  }

  async start(): Promise<positron.LanguageRuntimeInfo> {
    this._stateEmitter.fire(positron.RuntimeState.Initializing);
    this._stateEmitter.fire(positron.RuntimeState.Starting);

    await this._serverManager.ensureStarted(this._installation);

    this._runtimeInfo = {
      banner: this.buildStartupBanner(),
      implementation_version: "MCP",
      language_version: this._installation.version,
    };

    this._stateEmitter.fire(positron.RuntimeState.Ready);
    this._stateEmitter.fire(positron.RuntimeState.Idle);
    return this._runtimeInfo;
  }

  execute(
    code: string,
    id: string,
    mode: positron.RuntimeCodeExecutionMode,
    _errorBehavior: positron.RuntimeErrorBehavior,
  ): void {
    void this.executeInternal(code, id, mode);
  }

  async runFile(filePath: string): Promise<void> {
    const executionId = randomUUID();
    const configuration = getStataConfiguration();
    const client = await this.ensureClient();
    const workingDirectory = getWorkingDirectoryForFile(
      filePath,
      this._extensionPath,
      configuration,
    );

    this.emitInput(executionId, `do "${filePath}"`);
    this.enterBusyState(executionId);

    let fullOutput = "";
    let workingDirectoryChanged = false;
    try {
      const request = client.runFileStream(
        filePath,
        configuration.runFileTimeout,
        this.metadata.sessionId,
        workingDirectory,
        (message) => {
          fullOutput += `${message}\n`;
          if (
            !isStatusLine(message) &&
            !isGraphMetadataLine(message) &&
            message.trim().length > 0
          ) {
            this.emitStream(
              executionId,
              `${message}\n`,
              message.startsWith("ERROR:")
                ? positron.LanguageRuntimeStreamName.Stderr
                : positron.LanguageRuntimeStreamName.Stdout,
            );
          }
        },
      );
      this._activeRequest = { executionId, request };
      await request.completion;
      if (workingDirectory) {
        this._workingDirectory = workingDirectory;
        workingDirectoryChanged = true;
      }
      await this.emitGraphsIfNeeded(executionId, fullOutput);
      const output = stripGraphMetadata(fullOutput);
      if (!output) {
        this.emitOutput(
          executionId,
          `Completed ${vscode.workspace.asRelativePath(filePath, false)} with no textual output.`,
        );
      }
    } catch (error) {
      if (isStreamAbortError(error)) {
        this.emitStream(
          executionId,
          "Execution stopped by user.\n",
          positron.LanguageRuntimeStreamName.Stderr,
        );
      } else {
        this.emitError(executionId, error);
      }
    } finally {
      this._activeRequest = undefined;
      this.enterIdleState(executionId);
      await this.pollWorkingDirectory(workingDirectoryChanged);
      await this.refreshVariableClients();
    }
  }

  async showDataViewer(filter?: string): Promise<void> {
    const executionId = randomUUID();
    this.emitInput(executionId, filter ? `browse if ${filter}` : "browse");
    this.enterBusyState(executionId);

    try {
      await this.showDataViewerInternal(filter, executionId);
    } catch (error) {
      this.emitError(executionId, error);
    } finally {
      this.enterIdleState(executionId);
    }
  }

  async openHelpTopic(topic: string): Promise<void> {
    const executionId = randomUUID();
    this.emitInput(executionId, `help ${topic}`);
    this.enterBusyState(executionId);

    try {
      await this.showHelpInternal(topic, executionId);
    } catch (error) {
      this.emitError(executionId, error);
    } finally {
      this.enterIdleState(executionId);
    }
  }

  async testConnection(): Promise<string> {
    const client = await this.ensureClient();
    const output = await client.runSelectionText(
      'display "Hello from Positron Stata MCP!"',
      this.metadata.sessionId,
    );
    return output.trim();
  }

  isCodeFragmentComplete(
    code: string,
  ): Thenable<positron.RuntimeCodeFragmentStatus> {
    const trimmed = code.trimEnd();
    if (trimmed.endsWith("///") || /\/\*[^]*$/.test(trimmed)) {
      return Promise.resolve(positron.RuntimeCodeFragmentStatus.Incomplete);
    }
    return Promise.resolve(positron.RuntimeCodeFragmentStatus.Complete);
  }

  getDynState(): Thenable<positron.LanguageRuntimeDynState> {
    return Promise.resolve(this.dynState);
  }

  createClient(
    id: string,
    type: positron.RuntimeClientType,
    _params: unknown,
    _metadata?: unknown,
  ): Thenable<void> {
    this._clients.set(id, type);
    if (type === positron.RuntimeClientType.Variables) {
      setTimeout(() => {
        void this.refreshVariablesClient(id);
      }, 10);
    }
    if (type === positron.RuntimeClientType.Help) {
      // Help comm opened by Positron; nothing to initialize
    }
    if (type === positron.RuntimeClientType.Ui) {
      setTimeout(() => {
        void this.pollWorkingDirectory(true, [id]);
      }, 10);
    }
    return Promise.resolve();
  }

  listClients(
    type?: positron.RuntimeClientType,
  ): Thenable<Record<string, string>> {
    const clients: Record<string, string> = {};
    for (const [id, clientType] of this._clients.entries()) {
      if (!type || clientType === type) {
        clients[id] = clientType;
      }
    }
    if (!type || type === positron.RuntimeClientType.DataExplorer) {
      for (const id of this._dataExplorers.keys()) {
        clients[id] = positron.RuntimeClientType.DataExplorer;
      }
    }
    return Promise.resolve(clients);
  }

  removeClient(id: string): void {
    this._clients.delete(id);
    // Also clean up data explorer instances
    if (this._dataExplorers.has(id)) {
      this._dataExplorers.delete(id);
      if (this._activeDataExplorer?.commId === id) {
        this._activeDataExplorer = undefined;
      }
    }
  }

  sendClientMessage(
    clientId: string,
    messageId: string,
    message: unknown,
  ): void {
    void this.handleClientMessage(clientId, messageId, message).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.sendClientError(clientId, messageId, -32603, message);
      },
    );
  }

  replyToPrompt(_id: string, _reply: string): void {
    throw new Error(
      "Interactive prompts are not implemented for Stata sessions.",
    );
  }

  async interrupt(): Promise<void> {
    const activeRequest = this._activeRequest;
    if (!activeRequest) {
      return;
    }

    const client = await this.ensureClient();
    await client.stopExecution(this.metadata.sessionId).catch(() => undefined);
    activeRequest.request.abort();
  }

  async restart(workingDirectory?: string): Promise<void> {
    if (workingDirectory) {
      this._workingDirectory = workingDirectory;
    }

    this._stateEmitter.fire(positron.RuntimeState.Restarting);
    await this.interrupt().catch(() => undefined);
    const client = await this.ensureClient();
    await client.destroySession(this.metadata.sessionId).catch(() => undefined);
    this._stateEmitter.fire(positron.RuntimeState.Ready);
    this._stateEmitter.fire(positron.RuntimeState.Idle);
    await this.pollWorkingDirectory(true);
    await this.refreshVariableClients();
  }

  async shutdown(
    exitReason = positron.RuntimeExitReason.Shutdown,
  ): Promise<void> {
    await this.interrupt().catch(() => undefined);
    const client = await this.ensureClient();
    await client.destroySession(this.metadata.sessionId).catch(() => undefined);
    this._stateEmitter.fire(positron.RuntimeState.Exited);
    this._exitEmitter.fire({
      runtime_name: this.runtimeMetadata.runtimeName,
      session_name: this.dynState.sessionName,
      exit_code: 0,
      reason: exitReason,
      message: "",
    });
  }

  async forceQuit(): Promise<void> {
    await this.shutdown(positron.RuntimeExitReason.ForcedQuit);
  }

  showOutput(_channel?: positron.LanguageRuntimeSessionChannel): void {
    this._serverManager.showLogs();
  }

  listOutputChannels(): positron.LanguageRuntimeSessionChannel[] {
    return [positron.LanguageRuntimeSessionChannel.Console];
  }

  openResource(resource: vscode.Uri | string): Thenable<boolean> {
    const topic =
      typeof resource === "string"
        ? resource.replace(/^help:/, "")
        : resource.toString().replace(/^help:/, "");
    if (!topic) {
      return Promise.resolve(false);
    }
    void this.openHelpTopic(topic);
    return Promise.resolve(true);
  }

  async debug(
    _request: positron.DebugProtocolRequest,
  ): Promise<positron.DebugProtocolResponse> {
    throw new Error("Debugging is not supported for Stata sessions.");
  }

  async callMethod(method: string, ...args: Array<unknown>): Promise<unknown> {
    switch (method) {
      case "help":
        return this.openHelpTopic(String(args[0] || ""));
      case "view_data":
        return this.showDataViewer(
          typeof args[0] === "string" ? args[0] : undefined,
        );
      case "run_file":
        return this.runFile(String(args[0] || ""));
      case "test_connection":
        return this.testConnection();
      default:
        throw new Error(`Unknown Stata session method: ${method}`);
    }
  }

  async setWorkingDirectory(dir: string): Promise<void> {
    this._workingDirectory = dir || undefined;
    await this.pollWorkingDirectory(true);
  }

  dispose(): void {
    this._clients.clear();
    this._dataExplorers.clear();
    this._activeDataExplorer = undefined;
    void this._helpServer.stop();
    this._messageEmitter.dispose();
    this._stateEmitter.dispose();
    this._exitEmitter.dispose();
    this._resourceUsageEmitter.dispose();
  }

  updateSessionName(name: string): void {
    this.dynState.sessionName = name;
  }

  private async executeInternal(
    code: string,
    executionId: string,
    mode: positron.RuntimeCodeExecutionMode,
  ): Promise<void> {
    const trimmed = code.trim();
    if (!trimmed) {
      return;
    }

    this.emitInput(executionId, code);
    this.enterBusyState(executionId);
    let workingDirectoryChanged = false;

    try {
      const helpTopic = parseHelpCommand(trimmed);
      if (helpTopic) {
        await this.showHelpInternal(helpTopic, executionId);
        return;
      }

      const browseFilter = parseBrowseCommand(trimmed);
      if (browseFilter !== null) {
        await this.openDataExplorer(
          browseFilter || undefined,
          executionId,
          DATASET_VARIABLE_PATH,
        );
        return;
      }

      const configuration = getStataConfiguration();
      const client = await this.ensureClient();
      let fullOutput = "";
      const request = client.runSelectionStream(
        code,
        configuration.runSelectionTimeout,
        this.metadata.sessionId,
        this._workingDirectory,
        (message) => {
          fullOutput += `${message}\n`;
          if (
            isStatusLine(message) ||
            isGraphMetadataLine(message) ||
            mode === positron.RuntimeCodeExecutionMode.Silent
          ) {
            return;
          }
          this.emitStream(
            executionId,
            `${message}\n`,
            message.startsWith("ERROR:")
              ? positron.LanguageRuntimeStreamName.Stderr
              : positron.LanguageRuntimeStreamName.Stdout,
          );
        },
      );

      this._activeRequest = { executionId, request };
      await request.completion;
      const changedDirectory = this.resolveWorkingDirectoryTarget(
        parseChangeDirectoryCommand(code),
      );
      if (changedDirectory) {
        this._workingDirectory = changedDirectory;
        workingDirectoryChanged = true;
      }
      await this.emitGraphsIfNeeded(executionId, fullOutput);

      const output = stripGraphMetadata(fullOutput);
      if (!output && mode !== positron.RuntimeCodeExecutionMode.Silent) {
        this.emitOutput(executionId, "(no output)");
      }
    } catch (error) {
      if (isStreamAbortError(error)) {
        this.emitStream(
          executionId,
          "Execution stopped by user.\n",
          positron.LanguageRuntimeStreamName.Stderr,
        );
      } else {
        this.emitError(executionId, error);
      }
    } finally {
      if (this._activeRequest?.executionId === executionId) {
        this._activeRequest = undefined;
      }
      this.enterIdleState(executionId);
      await this.pollWorkingDirectory(workingDirectoryChanged);
      await this.refreshVariableClients();
    }
  }

  private async handleClientMessage(
    clientId: string,
    messageId: string,
    message: unknown,
  ): Promise<void> {
    const clientType = this._clients.get(clientId);

    // Check if this is a Data Explorer comm (opened by us, not tracked in _clients)
    const dataExplorer = this._dataExplorers.get(clientId);
    if (dataExplorer) {
      this.handleDataExplorerMessage(dataExplorer, clientId, messageId, message);
      return;
    }

    if (!clientType) {
      throw new Error(`Unknown runtime client: ${clientId}`);
    }

    if (clientType === positron.RuntimeClientType.Help) {
      await this.handleHelpClientMessage(clientId, messageId, message);
      return;
    }

    if (clientType === positron.RuntimeClientType.Ui) {
      this.sendClientResult(clientId, messageId, null);
      return;
    }

    if (clientType !== positron.RuntimeClientType.Variables) {
      this.sendClientError(
        clientId,
        messageId,
        -32601,
        `Unsupported Stata runtime client type: ${clientType}`,
      );
      return;
    }

    const rpc = (message || {}) as {
      method?: string;
      params?: Record<string, unknown>;
    };
    switch (rpc.method) {
      case "list":
        this.sendClientResult(
          clientId,
          messageId,
          await this.buildVariableListPayload(),
        );
        return;
      case "clear":
        await this.clearVariables(rpc.params as VariablesClearParams | undefined);
        this.sendClientResult(clientId, messageId, null);
        return;
      case "delete":
        this.sendClientResult(
          clientId,
          messageId,
          await this.deleteVariables(rpc.params as VariablesDeleteParams | undefined),
        );
        return;
      case "inspect":
        this.sendClientResult(
          clientId,
          messageId,
          await this.inspectVariable(this.readVariablePath(rpc.params?.path)),
        );
        return;
      case "query_table_summary":
        this.sendClientResult(
          clientId,
          messageId,
          await this.queryTableSummary(this.readVariablePath(rpc.params?.path)),
        );
        return;
      case "view":
        await this.openVariableViewer(this.readVariablePath(rpc.params?.path));
        this.sendClientResult(
          clientId,
          messageId,
          `stata-data-explorer:${this.metadata.sessionId}`,
        );
        return;
      case "clipboard_format":
        this.sendClientResult(
          clientId,
          messageId,
          await this.formatVariableForClipboard(
            this.readVariablePath(rpc.params?.path),
            typeof rpc.params?.format === "string"
              ? rpc.params.format
              : "text/plain",
          ),
        );
        return;
      default:
        this.sendClientError(
          clientId,
          messageId,
          -32601,
          `Unsupported Stata variables method: ${rpc.method || "unknown"}`,
        );
    }
  }

  private async ensureClient(): Promise<StataServerClient> {
    return this._serverManager.ensureStarted(this._installation);
  }

  private resolveInitialWorkingDirectory(): string | undefined {
    const configuration = getStataConfiguration();

    if (configuration.workingDirectoryMode === "none") {
      return undefined;
    }

    if (configuration.workingDirectoryMode === "extension") {
      return path.join(this._extensionPath, "logs");
    }

    if (
      configuration.workingDirectoryMode === "custom" &&
      configuration.customWorkingDirectory
    ) {
      return configuration.customWorkingDirectory;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.uri.scheme === "file") {
      return getWorkingDirectoryForFile(
        activeEditor.document.uri.fsPath,
        this._extensionPath,
        configuration,
      );
    }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return undefined;
    }

    if (configuration.workingDirectoryMode === "parent") {
      return path.dirname(workspacePath);
    }

    return workspacePath;
  }

  private buildStartupBanner(): string {
    return buildStataConsoleBanner();
  }

  private async buildVariableListPayload(): Promise<VariableListPayload> {
    const variables = await this.listRootVariables();
    return {
      variables,
      length: variables.length,
      version: this._variablesVersion,
    };
  }

  private async listRootVariables(): Promise<StataRuntimeVariable[]> {
    const metadata = await this.fetchDatasetMetadata();
    if (!metadata || metadata.columns.length === 0) {
      return [];
    }
    return [this.createDatasetVariable(metadata)];
  }

  private async inspectVariable(
    path: string[],
  ): Promise<VariableChildrenPayload> {
    if (path.length === 0) {
      const variables = await this.listRootVariables();
      return { children: variables, length: variables.length };
    }

    const metadata = await this.fetchDatasetMetadata();
    if (!metadata || metadata.columns.length === 0) {
      return { children: [], length: 0 };
    }

    if (path[0] !== DATASET_ACCESS_KEY) {
      throw new Error(`Unknown Stata variable path: ${path.join(".")}`);
    }

    if (path.length === 1) {
      const children = metadata.columns.map((column) =>
        this.createColumnVariable(column, metadata),
      );
      return { children, length: children.length };
    }

    return { children: [], length: 0 };
  }

  private async queryTableSummary(
    path: string[],
  ): Promise<positron.QueryTableSummaryResult> {
    const metadata = await this.fetchDatasetMetadata();
    if (!metadata || metadata.columns.length === 0) {
      return {
        num_rows: 0,
        num_columns: 0,
        column_schemas: [],
        column_profiles: [],
      };
    }

    if (path.length === 0 || path[0] !== DATASET_ACCESS_KEY) {
      throw new Error(
        "Table summary is only available for the active Stata dataset.",
      );
    }

    return {
      num_rows: metadata.total_rows,
      num_columns: metadata.columns.length,
      column_schemas: metadata.columns.map(
        (column) => `${column}: ${metadata.dtypes[column] || "unknown"}`,
      ),
      column_profiles: metadata.columns.map(() => ""),
    };
  }

  private async openVariableViewer(path: string[]): Promise<void> {
    if (path.length === 0 || path[0] !== DATASET_ACCESS_KEY) {
      throw new Error("Only the active Stata dataset can be viewed.");
    }
    await this.openDataExplorer(undefined, undefined, path);
  }

  private async formatVariableForClipboard(
    path: string[],
    format: string,
  ): Promise<{ content: string }> {
    const metadata = await this.fetchDatasetMetadata();
    if (
      !metadata ||
      metadata.columns.length === 0 ||
      metadata.total_rows === 0
    ) {
      return { content: "" };
    }

    if (
      path.length === 0 ||
      (path[0] === DATASET_ACCESS_KEY && path.length === 1)
    ) {
      const text = `dataset: ${metadata.total_rows} observations x ${metadata.columns.length} variables`;
      return { content: format === "text/html" ? `<p>${text}</p>` : text };
    }

    if (path[0] === DATASET_ACCESS_KEY && path.length >= 2) {
      const columnName = this.decodeColumnAccessKey(path[1]);
      const dtype = metadata.dtypes[columnName] || "unknown";
      const text = `${columnName}: ${dtype} (${metadata.total_rows} observations)`;
      return { content: format === "text/html" ? `<p>${text}</p>` : text };
    }

    throw new Error(`Unknown Stata variable path: ${path.join(".")}`);
  }

  private async fetchDatasetMetadata(): Promise<DataViewResponse | undefined> {
    try {
      const client = await this.ensureClient();
      const response = await client.getData(
        undefined,
        100,
        this.metadata.sessionId,
      );
      if (response.status !== "success") {
        return undefined;
      }
      return response;
    } catch {
      // No dataset loaded or server not ready — return undefined so the
      // Variables pane shows an empty list instead of throwing.
      return undefined;
    }
  }

  private createDatasetVariable(
    metadata: DataViewResponse,
  ): StataRuntimeVariable {
    const numRows = metadata.total_rows || metadata.rows || 0;
    const numColumns = metadata.columns.length;
    return {
      access_key: DATASET_ACCESS_KEY,
      display_name: "dataset",
      display_value: `${numRows} observations x ${numColumns} variables`,
      display_type: "table",
      type_info: "Stata dataset",
      length: numColumns,
      size: numRows * numColumns,
      has_children: numColumns > 0,
      kind: "table",
      has_viewer: true,
      is_truncated: false,
      updated_time: Date.now(),
    };
  }

  private createColumnVariable(
    column: string,
    metadata: DataViewResponse,
  ): StataRuntimeVariable {
    const numRows = metadata.total_rows || metadata.rows || 0;
    const dtype = metadata.dtypes[column] || "unknown";
    const preview = this.buildColumnPreview(column, metadata);
    return {
      access_key: `${COLUMN_ACCESS_KEY_PREFIX}${column}`,
      display_name: column,
      display_value: preview,
      display_type: `${dtype} [${numRows}]`,
      type_info: dtype,
      length: numRows,
      size: numRows,
      has_children: false,
      kind: this.inferVariableKind(dtype),
      has_viewer: false,
      is_truncated: false,
      updated_time: Date.now(),
    };
  }

  private inferVariableKind(dtype: string): StataRuntimeVariable["kind"] {
    return /int|float|double|long|byte|number|numeric/i.test(dtype)
      ? "number"
      : "string";
  }

  private buildColumnPreview(
    column: string,
    metadata: DataViewResponse,
  ): string {
    const columnIndex = metadata.columns.indexOf(column);
    if (columnIndex < 0) {
      return "";
    }

    const previewValues = metadata.data
      .slice(0, 8)
      .map((row) => row?.[columnIndex])
      .filter((value) => value !== undefined)
      .map((value) => this.formatVariablePreviewValue(value));

    if (previewValues.length === 0) {
      return "";
    }

    const hasMoreValues = (metadata.total_rows || metadata.rows || 0) > previewValues.length;
    return `${previewValues.join(" ")}${hasMoreValues ? " ..." : ""}`;
  }

  private formatVariablePreviewValue(value: unknown): string {
    if (value === null || value === undefined || value === "") {
      return ".";
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : ".";
    }

    if (typeof value === "string") {
      const normalized = value.replace(/\s+/g, " ").trim();
      const truncated =
        normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
      return `"${truncated}"`;
    }

    return String(value);
  }

  private async clearVariables(
    _params?: VariablesClearParams,
  ): Promise<void> {
    const client = await this.ensureClient();
    const response = await client.runSelectionText(
      "clear all",
      this.metadata.sessionId,
    );

    if (/^ERROR:/m.test(response)) {
      throw new Error(response.trim());
    }

    if (this._activeDataExplorer) {
      this.closeDataExplorer(this._activeDataExplorer.commId);
    }

    await this.refreshVariableClients();
  }

  private async deleteVariables(
    params?: VariablesDeleteParams,
  ): Promise<string[]> {
    const names = Array.isArray(params?.names) ? params.names : [];
    if (names.length === 0) {
      return [];
    }

    if (names.includes("dataset")) {
      await this.clearVariables();
      return ["dataset"];
    }

    return [];
  }

  private readVariablePath(path: unknown): string[] {
    if (!Array.isArray(path)) {
      return [];
    }
    return path.filter((entry): entry is string => typeof entry === "string");
  }

  private decodeColumnAccessKey(accessKey: string): string {
    return accessKey.startsWith(COLUMN_ACCESS_KEY_PREFIX)
      ? accessKey.slice(COLUMN_ACCESS_KEY_PREFIX.length)
      : accessKey;
  }

  private async refreshVariableClients(): Promise<void> {
    const variableClients = [...this._clients.entries()]
      .filter(([, type]) => type === positron.RuntimeClientType.Variables)
      .map(([id]) => id);

    if (variableClients.length === 0) {
      return;
    }

    this._variablesVersion += 1;
    const payload = await this.buildVariableListPayload();
    for (const clientId of variableClients) {
      this.sendClientNotification(clientId, "refresh", payload);
    }
  }

  private async refreshVariablesClient(clientId: string): Promise<void> {
    if (this._clients.get(clientId) !== positron.RuntimeClientType.Variables) {
      return;
    }

    this._variablesVersion += 1;
    const payload = await this.buildVariableListPayload();
    this.sendClientNotification(clientId, "refresh", payload);
  }

  private getClientIdsByType(type: positron.RuntimeClientType): string[] {
    return [...this._clients.entries()]
      .filter(([, clientType]) => clientType === type)
      .map(([id]) => id);
  }

  private resolveWorkingDirectoryTarget(
    target: string | null,
  ): string | undefined {
    if (!target) {
      return undefined;
    }

    let normalizedTarget = target.trim();
    if (
      (normalizedTarget.startsWith('"') && normalizedTarget.endsWith('"')) ||
      (normalizedTarget.startsWith("'") && normalizedTarget.endsWith("'"))
    ) {
      normalizedTarget = normalizedTarget.slice(1, -1);
    }

    if (!normalizedTarget) {
      return undefined;
    }

    if (normalizedTarget === "~") {
      return os.homedir();
    }
    if (
      normalizedTarget.startsWith("~/") ||
      normalizedTarget.startsWith("~\\")
    ) {
      return path.join(os.homedir(), normalizedTarget.slice(2));
    }

    if (path.isAbsolute(normalizedTarget)) {
      return path.normalize(normalizedTarget);
    }

    const baseDirectory =
      this._workingDirectory ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!baseDirectory) {
      return path.normalize(normalizedTarget);
    }

    return path.resolve(baseDirectory, normalizedTarget);
  }

  private async pollWorkingDirectory(
    force = false,
    clientIds = this.getClientIdsByType(positron.RuntimeClientType.Ui),
  ): Promise<void> {
    if (clientIds.length === 0) {
      return;
    }

    const directory = this._workingDirectory?.trim();
    if (!directory) {
      return;
    }

    if (!force && directory === this._lastReportedWorkingDirectory) {
      return;
    }

    this._lastReportedWorkingDirectory = directory;
    const params: UiWorkingDirectoryParams = {
      directory: aliasHome(directory),
    };
    for (const clientId of clientIds) {
      this.sendClientNotification(clientId, "working_directory", params);
    }
  }

  private emitInput(parentId: string, code: string): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.Input,
      code,
      execution_count: ++this._executionCount,
    } as positron.LanguageRuntimeInput);
  }

  private emitStream(
    parentId: string,
    text: string,
    name: positron.LanguageRuntimeStreamName,
  ): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.Stream,
      name,
      text,
    } as positron.LanguageRuntimeStream);
  }

  private emitOutput(parentId: string, output: string): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.Output,
      data: {
        "text/plain": output,
      },
    } as positron.LanguageRuntimeOutput);
  }

  private emitError(parentId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.Error,
      name: "StataError",
      message,
      traceback:
        error instanceof Error && error.stack ? error.stack.split("\n") : [],
    } as positron.LanguageRuntimeError);
  }

  private sendClientNotification(
    clientId: string,
    method: string,
    params: unknown,
  ): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: "",
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.CommData,
      comm_id: clientId,
      data: {
        jsonrpc: "2.0",
        method,
        params,
      },
    } as positron.LanguageRuntimeCommMessage);
  }

  private sendClientResult(
    clientId: string,
    parentId: string,
    result: unknown,
  ): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.CommData,
      comm_id: clientId,
      data: {
        jsonrpc: "2.0",
        id: parentId,
        result,
      },
    } as positron.LanguageRuntimeCommMessage);
  }

  private sendClientError(
    clientId: string,
    parentId: string,
    code: number,
    message: string,
  ): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.CommData,
      comm_id: clientId,
      data: {
        jsonrpc: "2.0",
        id: parentId,
        error: {
          code,
          message,
        },
      },
    } as positron.LanguageRuntimeCommMessage);
  }

  private enterBusyState(parentId: string): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.State,
      state: positron.RuntimeOnlineState.Busy,
    } as positron.LanguageRuntimeState);
    this._stateEmitter.fire(positron.RuntimeState.Busy);
  }

  private enterIdleState(parentId: string): void {
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.State,
      state: positron.RuntimeOnlineState.Idle,
    } as positron.LanguageRuntimeState);
    this._stateEmitter.fire(positron.RuntimeState.Idle);
  }

  private async emitGraphsIfNeeded(
    parentId: string,
    output: string,
  ): Promise<void> {
    if (!getStataConfiguration().autoDisplayGraphs) {
      return;
    }

    const graphs = parseGraphsFromOutput(output);
    for (const graph of graphs) {
      await this.emitGraph(parentId, graph);
    }
  }

  private async emitGraph(
    parentId: string,
    graph: GraphDescriptor,
  ): Promise<void> {
    const graphPath = graph.path.replace(/\//g, path.sep);
    if (!fs.existsSync(graphPath)) {
      return;
    }

    const encoded = fs.readFileSync(graphPath).toString("base64");
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.Output,
      data: {
        "text/plain": graph.name,
        "image/png": encoded,
      },
    } as positron.LanguageRuntimeOutput);
  }

  private async showHelpInternal(
    topic: string,
    _parentId: string,
  ): Promise<void> {
    const client = await this.ensureClient();
    const html = await client.getHelpHtml(topic);

    // Find a Help comm client to send the content to
    const helpClientId = this.findClientByType(positron.RuntimeClientType.Help);
    if (helpClientId) {
      // Start the local help HTTP server and publish the page
      await this._helpServer.start();
      const url = this._helpServer.publish(topic, html);

      // Send show_help event via the Help comm → renders in Help pane
      // Positron requires kind: "url" (not "html")
      this.sendClientNotification(helpClientId, "show_help", {
        content: url,
        kind: "url",
        focus: true,
      });
    } else {
      // Fallback: emit as Viewer output if no Help comm is available
      this._messageEmitter.fire({
        id: randomUUID(),
        parent_id: _parentId,
        when: new Date().toISOString(),
        type: positron.LanguageRuntimeMessageType.Output,
        data: {
          "text/plain": `Stata help: ${topic}`,
          "text/html": html,
        },
        output_location: positron.PositronOutputLocation.Viewer,
        resource_roots: [],
      } as positron.LanguageRuntimeWebOutput);
    }
  }

  private async showDataViewerInternal(
    filter: string | undefined,
    parentId: string,
  ): Promise<void> {
    await this.openDataExplorer(filter, parentId, DATASET_VARIABLE_PATH);
  }

  /**
   * Open the active Stata dataset in Positron's Data Explorer.
   * Creates a new DataExplorer comm and sends a CommOpen message.
   */
  private async openDataExplorer(
    filter?: string,
    parentId = "",
    variablePath?: string[],
  ): Promise<void> {
    const configuration = getStataConfiguration();
    const client = await this.ensureClient();
    const response = await client.getData(
      filter,
      configuration.dataViewerMaxRows,
      this.metadata.sessionId,
    );
    if (response.status === "error") {
      throw new Error(response.message || "Stata data viewer request failed");
    }

    const title = filter ? `dataset (${filter})` : "dataset";

    // Close previous data explorer if one exists for the same view
    if (this._activeDataExplorer) {
      this.closeDataExplorer(this._activeDataExplorer.commId);
    }

    const explorer = new StataDataExplorer(response, title);
    this._dataExplorers.set(explorer.commId, explorer);
    this._activeDataExplorer = explorer;

    // Emit CommOpen to tell Positron to open a Data Explorer panel
    this._messageEmitter.fire(
      explorer.buildCommOpenMessage(parentId, variablePath),
    );
  }

  /**
   * Handle incoming JSON-RPC messages for a Data Explorer comm.
   */
  private handleDataExplorerMessage(
    explorer: StataDataExplorer,
    clientId: string,
    messageId: string,
    message: unknown,
  ): void {
    const rpc = (message || {}) as {
      method?: string;
      params?: Record<string, unknown>;
    };

    if (!rpc.method) {
      this.sendClientError(clientId, messageId, -32600, "Missing method");
      return;
    }

    try {
      if (rpc.method === "get_column_profiles") {
        const response = explorer.buildColumnProfilesResponse(rpc.params ?? {});
        this.sendClientNotification(
          clientId,
          "return_column_profiles",
          response,
        );
        this.sendClientResult(clientId, messageId, null);
        return;
      }

      const result = explorer.handleRequest(rpc.method, rpc.params ?? {});
      this.sendClientResult(clientId, messageId, result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (rpc.method === "get_column_profiles") {
        const callbackId =
          typeof rpc.params?.callback_id === "string"
            ? rpc.params.callback_id
            : "";
        this.sendClientNotification(clientId, "return_column_profiles", {
          callback_id: callbackId,
          profiles: [],
          error_message: msg,
        });
        this.sendClientResult(clientId, messageId, null);
        return;
      }

      this.sendClientError(clientId, messageId, -32603, msg);
    }
  }

  /**
   * Close a Data Explorer comm.
   */
  private closeDataExplorer(commId: string): void {
    this._dataExplorers.delete(commId);
    if (this._activeDataExplorer?.commId === commId) {
      this._activeDataExplorer = undefined;
    }
    this._messageEmitter.fire({
      id: randomUUID(),
      parent_id: "",
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.CommClosed,
      comm_id: commId,
      data: {},
    } as positron.LanguageRuntimeCommClosed);
  }

  /**
   * Find the first client ID matching a given type.
   */
  private findClientByType(type: positron.RuntimeClientType): string | undefined {
    for (const [id, clientType] of this._clients.entries()) {
      if (clientType === type) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Handle incoming messages on the Help comm.
   * Positron sends `show_help_topic` when the user requests help.
   */
  private async handleHelpClientMessage(
    clientId: string,
    messageId: string,
    message: unknown,
  ): Promise<void> {
    const rpc = (message || {}) as {
      method?: string;
      params?: Record<string, unknown>;
    };

    if (rpc.method === "show_help_topic") {
      const topic = String(rpc.params?.topic ?? "");
      if (!topic) {
        this.sendClientResult(clientId, messageId, false);
        return;
      }

      try {
        const client = await this.ensureClient();
        const html = await client.getHelpHtml(topic);
        // Start the local help HTTP server and publish the page
        await this._helpServer.start();
        const url = this._helpServer.publish(topic, html);
        // Send the result first to acknowledge the request
        this.sendClientResult(clientId, messageId, true);
        // Then send the help content URL as an event
        this.sendClientNotification(clientId, "show_help", {
          content: url,
          kind: "url",
          focus: true,
        });
      } catch {
        this.sendClientResult(clientId, messageId, false);
      }
      return;
    }

    this.sendClientError(
      clientId,
      messageId,
      -32601,
      `Unsupported Help method: ${rpc.method || "unknown"}`,
    );
  }
}
