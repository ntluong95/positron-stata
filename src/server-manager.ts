import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { getStataConfiguration } from "./configuration";
import { getPreferredStataInstallation } from "./provider";
import { StataServerClient } from "./server-client";
import { StataInstallation } from "./stata-installation";

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 120000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnNodeProcess(
  scriptPath: string,
  cwd: string,
  logger: vscode.LogOutputChannel,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [scriptPath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk) => {
      logger.appendLine(`[setup] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on("data", (chunk) => {
      logger.appendLine(`[setup] ${chunk.toString().trimEnd()}`);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`Python environment setup failed with exit code ${code}`),
      );
    });
  });
}

function execShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export class StataServerManager implements vscode.Disposable {
  private _serverProcess?: childProcess.ChildProcessWithoutNullStreams;
  private _startupPromise?: Promise<StataServerClient>;
  private _setupPromise?: Promise<void>;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _logger: vscode.LogOutputChannel,
  ) {}

  async warmup(installation?: StataInstallation): Promise<void> {
    try {
      await this.ensureStarted(installation);
    } catch (error) {
      this._logger.warn(`Stata server warmup failed: ${error}`);
    }
  }

  async ensureStarted(
    installation?: StataInstallation,
  ): Promise<StataServerClient> {
    const healthyClient = await this.getHealthyClient();
    if (healthyClient) {
      return healthyClient;
    }

    if (this._startupPromise) {
      return this._startupPromise;
    }

    this._startupPromise = this.startServer(installation).finally(() => {
      this._startupPromise = undefined;
    });
    return this._startupPromise;
  }

  showLogs(): void {
    this._logger.show(true);
  }

  logInfo(message: string): void {
    this._logger.info(message);
  }

  logWarning(message: string): void {
    this._logger.warn(message);
  }

  async stopServer(): Promise<void> {
    if (!this._serverProcess) {
      return;
    }

    await new Promise<void>((resolve) => {
      const serverProcess = this._serverProcess;
      this._serverProcess = undefined;
      serverProcess.once("exit", () => resolve());
      serverProcess.kill();
      setTimeout(() => resolve(), 2000);
    });
  }

  dispose(): void {
    void this.stopServer();
  }

  private async startServer(
    installation?: StataInstallation,
  ): Promise<StataServerClient> {
    const configuration = getStataConfiguration();
    const resolvedInstallation =
      installation || (await getPreferredStataInstallation());
    const installationPath =
      configuration.installationPath || resolvedInstallation?.installationPath;
    const edition = resolvedInstallation?.edition || configuration.edition;

    if (!installationPath) {
      throw new Error(
        "No Stata installation was discovered. Set positron.stata.installationPath first.",
      );
    }

    if (configuration.forcePort) {
      await this.killProcessOnPort(configuration.serverPort).catch((error) => {
        this._logger.warn(
          `Unable to free port ${configuration.serverPort}: ${error}`,
        );
      });
    }

    await this.ensurePythonEnvironment();

    const pythonCommand = this.resolvePythonCommand();
    const serverScript = path.join(
      this._context.extensionPath,
      "python",
      "stata_mcp_server.py",
    );
    if (!fs.existsSync(serverScript)) {
      throw new Error(`Stata server script not found: ${serverScript}`);
    }

    const args = [
      serverScript,
      "--host",
      configuration.serverHost,
      "--port",
      String(configuration.serverPort),
      "--stata-path",
      installationPath,
      "--stata-edition",
      edition,
      "--log-level",
      configuration.debug ? "DEBUG" : "INFO",
      "--result-display-mode",
      configuration.resultDisplayMode,
      "--max-output-tokens",
      String(configuration.maxOutputTokens),
      "--max-sessions",
      String(configuration.maxSessions),
      "--session-timeout",
      String(configuration.sessionTimeout),
    ];

    if (!configuration.multiSession) {
      args.push("--no-multi-session");
    } else {
      args.push("--multi-session");
    }

    this._logger.info(
      `Starting PyStata server on ${configuration.serverHost}:${configuration.serverPort}`,
    );
    this._serverProcess = childProcess.spawn(pythonCommand, args, {
      cwd: path.join(this._context.extensionPath, "python"),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    });

    this._serverProcess.stdout?.on("data", (chunk) => {
      this._logger.appendLine(`[server] ${chunk.toString().trimEnd()}`);
    });
    this._serverProcess.stderr?.on("data", (chunk) => {
      this._logger.appendLine(`[server] ${chunk.toString().trimEnd()}`);
    });
    this._serverProcess.on("exit", (code, signal) => {
      this._logger.info(
        `Stata MCP server exited with code ${code} and signal ${signal}`,
      );
      this._serverProcess = undefined;
    });

    const client = this.createClient();
    await this.waitForHealthyServer(client);
    return client;
  }

  private createClient(): StataServerClient {
    const configuration = getStataConfiguration();
    return new StataServerClient(
      configuration.serverHost,
      configuration.serverPort,
    );
  }

  private async getHealthyClient(): Promise<StataServerClient | undefined> {
    const client = this.createClient();
    try {
      const health = await client.health();
      if (health.status === "ok" && health.stata_available) {
        return client;
      }
    } catch {
      // Server is not healthy yet.
    }
    return undefined;
  }

  private async waitForHealthyServer(client: StataServerClient): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
      try {
        const health = await client.health();
        if (health.status === "ok" && health.stata_available) {
          return;
        }
      } catch {
        // Server is still booting.
      }
      await wait(HEALTH_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Stata MCP server did not become healthy within ${HEALTH_TIMEOUT_MS}ms`,
    );
  }

  private async ensurePythonEnvironment(): Promise<void> {
    if (this.hasUsablePythonEnvironment()) {
      return;
    }

    if (this._setupPromise) {
      return this._setupPromise;
    }

    const setupScript = path.join(
      this._context.extensionPath,
      "python",
      "check-python.js",
    );
    if (!fs.existsSync(setupScript)) {
      throw new Error(`Python setup script not found: ${setupScript}`);
    }

    this._setupPromise = spawnNodeProcess(
      setupScript,
      this._context.extensionPath,
      this._logger,
    ).finally(() => {
      this._setupPromise = undefined;
    });
    return this._setupPromise;
  }

  private hasUsablePythonEnvironment(): boolean {
    const setupMarker = path.join(
      this._context.extensionPath,
      ".setup-complete",
    );
    if (!fs.existsSync(setupMarker)) {
      return false;
    }

    const configuredPath = this.readStoredPythonPath();
    if (configuredPath && fs.existsSync(configuredPath)) {
      return true;
    }

    return fs.existsSync(this.defaultVenvPythonPath());
  }

  private resolvePythonCommand(): string {
    const configuredPath = this.readStoredPythonPath();
    if (configuredPath && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const venvPython = this.defaultVenvPythonPath();
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }

    return process.platform === "win32" ? "py" : "python3";
  }

  private readStoredPythonPath(): string | undefined {
    const pythonPathFile = path.join(
      this._context.extensionPath,
      ".python-path",
    );
    if (!fs.existsSync(pythonPathFile)) {
      return undefined;
    }

    const value = fs.readFileSync(pythonPathFile, "utf8").trim();
    return value || undefined;
  }

  private defaultVenvPythonPath(): string {
    return process.platform === "win32"
      ? path.join(this._context.extensionPath, ".venv", "Scripts", "python.exe")
      : path.join(this._context.extensionPath, ".venv", "bin", "python");
  }

  private async killProcessOnPort(port: number): Promise<void> {
    if (process.platform === "win32") {
      await execShell(
        `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') DO taskkill /F /PID %P`,
      );
      return;
    }

    await execShell(`lsof -ti:${port} | xargs kill -9`);
  }
}
