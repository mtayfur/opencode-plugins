import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createComponent, createSignal } from "solid-js";
import { FastStatus } from "./fast-status";
import { readFastMode, resolveStatePath, writeFastMode } from "./state";

const PLUGIN_ID = "mtayfur.codex-fast";
const TOAST_TITLE = "Codex Fast";

type CommandApi = Pick<TuiPluginApi, "keymap" | "lifecycle" | "ui">;
type SetEnabled = (enabled: boolean) => void;

function registerFastModeCommands(api: CommandApi, setEnabled: SetEnabled): void {
  let toggles = Promise.resolve();
  const disposeCommands = api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: "codex.fast.toggle",
        title: "Toggle Codex Fast Mode",
        desc: "Toggle priority service tier for ChatGPT Codex requests",
        category: TOAST_TITLE,
        slashName: "fast",
        run: () => {
          toggles = toggles.then(() => toggleFastMode(api, setEnabled));
          return toggles;
        },
      },
    ],
    bindings: [],
  });

  api.lifecycle.onDispose(disposeCommands);
}

async function toggleFastMode(api: CommandApi, setEnabled: SetEnabled): Promise<void> {
  await setFastMode(api, setEnabled, !(await readFastMode()));
}

async function setFastMode(api: CommandApi, setEnabled: SetEnabled, enabled: boolean): Promise<void> {
  try {
    await writeFastMode(enabled);
    setEnabled(enabled);
    showStateToast(api, enabled);
  } catch {
    api.ui.toast({
      title: TOAST_TITLE,
      message: "Fast mode state could not be updated.",
      variant: "error",
    });
  }
}

function showStateToast(api: CommandApi, enabled: boolean): void {
  api.ui.toast({
    title: TOAST_TITLE,
    message: `Fast mode is now ${enabled ? "ON" : "OFF"}.`,
    variant: "success",
  });
}

async function watchFastMode(setEnabled: SetEnabled): Promise<() => void> {
  const stateFile = resolveStatePath();

  try {
    await mkdir(dirname(stateFile), { recursive: true });
    const watcher = watch(dirname(stateFile), (_, filename) => {
      if (filename && basename(String(filename)) !== basename(stateFile)) return;
      void readFastMode(stateFile).then(setEnabled);
    });
    watcher.on("error", () => watcher.close());
    return () => watcher.close();
  } catch {
    return () => undefined;
  }
}

function sessionProvider(api: Pick<TuiPluginApi, "state">, sessionID: string): string | undefined {
  const session = api.state.session.get(sessionID);
  if (session?.model?.providerID) return session.model.providerID;

  const message = api.state.session.messages(sessionID).findLast((item) => item.role === "user");
  return message?.model.providerID;
}

const tui: TuiPlugin = async (api) => {
  const [enabled, setEnabled] = createSignal(await readFastMode());

  registerFastModeCommands(api, setEnabled);
  api.lifecycle.onDispose(await watchFastMode(setEnabled));
  api.slots.register({
    order: 55,
    slots: {
      session_prompt_right(_, props) {
        return createComponent(FastStatus, {
          enabled,
          providerID: () => sessionProvider(api, props.session_id),
        });
      },
    },
  });
};

export default {
  id: PLUGIN_ID,
  tui,
} satisfies TuiPluginModule & { id: string };
