import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const STATE_FILE_NAME = "codex-fast.json";

export type StatePathOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
  platform?: NodeJS.Platform;
};

export function resolveStatePath(options: StatePathOptions = {}): string {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const platform = options.platform ?? process.platform;
  const xdgConfigHome = nonEmpty(env.XDG_CONFIG_HOME);
  const appData = nonEmpty(env.APPDATA);

  const configRoot =
    xdgConfigHome ?? (platform === "win32" ? appData : undefined) ?? join(home, ".config");

  return join(configRoot, "opencode", STATE_FILE_NAME);
}

export async function readFastMode(filePath = resolveStatePath()): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isRecord(parsed) && parsed.enabled === true;
  } catch {
    return false;
  }
}

export async function writeFastMode(
  enabled: boolean,
  filePath = resolveStatePath(),
): Promise<void> {
  const directory = dirname(filePath);
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ enabled }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
