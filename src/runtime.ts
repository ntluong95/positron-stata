import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as positron from "positron";

import { StataInstallation } from "./stata-installation";

interface StataExtraRuntimeData {
  installationPath: string;
  edition: string;
}

function createRuntimeName(installation: StataInstallation): string {
  const edition = installation.edition.toUpperCase();
  return installation.version === "unknown"
    ? `Stata ${edition}`
    : `Stata ${edition} ${installation.version}`;
}

function getSessionLocation(): positron.LanguageRuntimeSessionLocation {
  const config = vscode.workspace.getConfiguration("kernelSupervisor");
  const shutdownTimeout = config.get<string>("shutdownTimeout", "immediately");
  return shutdownTimeout !== "immediately"
    ? positron.LanguageRuntimeSessionLocation.Machine
    : positron.LanguageRuntimeSessionLocation.Workspace;
}

function loadRuntimeIconSvg(extensionPath: string): string | undefined {
  const iconPath = path.join(
    extensionPath,
    "resources",
    "branding",
    "stata.svg",
  );
  try {
    const svg = fs.readFileSync(iconPath, "utf8").trim();
    return svg ? Buffer.from(svg, "utf8").toString("base64") : undefined;
  } catch {
    return undefined;
  }
}

export function createStataRuntimeMetadata(
  installation: StataInstallation,
  extensionPath: string,
): positron.LanguageRuntimeMetadata {
  return {
    runtimeId: installation.id,
    runtimeName: createRuntimeName(installation),
    runtimeShortName: "Stata",
    runtimePath: installation.installationPath,
    runtimeVersion: installation.version,
    runtimeSource: installation.reasonDiscovered,
    languageId: "stata",
    languageName: "Stata",
    languageVersion: installation.version,
    base64EncodedIconSvg: getStataRuntimeIconBase64(extensionPath),
    sessionLocation: getSessionLocation(),
    startupBehavior: positron.LanguageRuntimeStartupBehavior.Implicit,
    extraRuntimeData: {
      installationPath: installation.installationPath,
      edition: installation.edition,
    } satisfies StataExtraRuntimeData,
  };
}

export function getStataRuntimeIconBase64(extensionPath: string): string {
  return loadRuntimeIconSvg(extensionPath) ?? STATA_ICON_SVG_FALLBACK;
}

export function getStataExtraRuntimeData(
  metadata: positron.LanguageRuntimeMetadata,
): StataExtraRuntimeData | undefined {
  return metadata.extraRuntimeData as StataExtraRuntimeData | undefined;
}

const STATA_ICON_SVG_FALLBACK = Buffer.from(
  `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
	<rect width="128" height="128" rx="28" fill="#0c6b70"/>
	<path fill="#ffffff" d="M36 36h56v14H62v8h24v14H62v20H46V72H36V58h10z"/>
</svg>
`.trim(),
).toString("base64");
