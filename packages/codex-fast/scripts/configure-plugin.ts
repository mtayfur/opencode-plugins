#!/usr/bin/env bun

import { mkdir, rm } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";

const action = process.argv[2];
const serverPath = process.argv[3];
const tuiPath = process.argv[4];

if ((action !== "install" && action !== "uninstall") || !serverPath || !tuiPath) {
  throw new Error("Usage: configure-plugin.ts <install|uninstall> <server-path> <tui-path>");
}

const configDirectory = resolveConfigDirectory();
const serverConfig = await resolveServerConfig(configDirectory);
const tuiConfig = join(configDirectory, "tui.json");

const updates = await Promise.all([
  prepareConfig(serverConfig, pathToFileURL(resolve(serverPath)).href, "server"),
  prepareConfig(tuiConfig, pathToFileURL(resolve(tuiPath)).href, "TUI"),
]);
const written: ConfigUpdate[] = [];

try {
  for (const update of updates) {
    if (update.updated === undefined) continue;
    await mkdir(dirname(update.configFile), { recursive: true });
    await Bun.write(update.configFile, update.updated);
    written.push(update);
  }
} catch (error) {
  const rollbackErrors: unknown[] = [];
  for (const update of written.reverse()) {
    try {
      if (update.existed) await Bun.write(update.configFile, update.original);
      else await rm(update.configFile, { force: true });
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError([error, ...rollbackErrors], "Plugin configuration failed and rollback was incomplete.");
  }
  throw error;
}

for (const update of updates) console.log(update.message);

type ConfigUpdate = {
  configFile: string;
  existed: boolean;
  original: string;
  updated?: string;
  message: string;
};

async function prepareConfig(
  configFile: string,
  localEntry: string,
  target: string,
): Promise<ConfigUpdate> {
  const file = Bun.file(configFile);
  const existed = await file.exists();
  const contents = existed ? await file.text() : "";
  const source = contents.trim() === "" ? "{}\n" : contents;
  const errors: ParseError[] = [];
  const config: unknown = parse(source, errors, { allowTrailingComma: true });

  if (errors.length > 0) throw new Error(`Invalid JSONC in ${configFile}`);
  if (!isRecord(config)) throw new Error(`${configFile} must contain a JSON object.`);

  const current = config.plugin ?? [];
  if (!Array.isArray(current)) throw new Error(`${configFile}.plugin must be an array.`);

  const exists = current.some((entry) => entryName(entry) === localEntry);
  const next = action === "install"
    ? !exists
      ? [...current, localEntry]
      : current
    : current.filter((entry) => entryName(entry) !== localEntry);

  if (JSON.stringify(current) === JSON.stringify(next)) {
    return {
      configFile,
      existed,
      original: contents,
      message: `${target} plugin configuration is already up to date.`,
    };
  }

  const edits = modify(source, ["plugin"], next, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  const updated = applyEdits(source, edits);
  return {
    configFile,
    existed,
    original: contents,
    updated: updated.endsWith("\n") ? updated : `${updated}\n`,
    message: action === "install" ? `${target} plugin registered.` : `${target} plugin removed.`,
  };
}

async function resolveServerConfig(directory: string): Promise<string> {
  const jsonc = join(directory, "opencode.jsonc");
  if (await Bun.file(jsonc).exists()) return jsonc;

  const json = join(directory, "opencode.json");
  return (await Bun.file(json).exists()) ? json : jsonc;
}

function resolveConfigDirectory(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(xdg, "opencode");

  const appData = process.env.APPDATA?.trim();
  if (platform() === "win32" && appData) return join(appData, "opencode");

  return join(homedir(), ".config", "opencode");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entryName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0];
  return undefined;
}
