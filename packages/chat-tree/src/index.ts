import { createComponent } from "solid-js";
import type { TuiPlugin, TuiPluginModule, TuiRouteCurrent } from "@opencode-ai/plugin/tui";
import { readPluginConfiguration, readSummaryModel } from "./configuration";
import { resolveTreeStorageRoot } from "./adapters/tree-repository";
import { TreeRoute } from "./ui/tree-route";

const PLUGIN_ID = "opencode.chat-tree";
const TREE_ROUTE = "tree";

const tui: TuiPlugin = async (api, rawOptions) => {
  const configuration = readPluginConfiguration(rawOptions);
  const canOpenTree = () => isSessionRoute(api.route.current);
  const disposePalette = api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: "chat-tree.open",
        title: "Conversation Tree",
        category: "Plugin",
        slashName: "tree",
        suggested: canOpenTree,
        enabled: canOpenTree,
        run: () => {
          api.route.navigate(TREE_ROUTE, treeRouteParams(api.route.current));
          api.ui.dialog.clear();
        },
      },
    ],
  });
  const disposeRoute = api.route.register([
    {
      name: TREE_ROUTE,
      render: ({ params }) => {
        const projectRoot = resolveProjectRoot(api.state.path);
        const storageRoot = projectRoot
          ? resolveTreeStorageRoot({
              projectRoot,
              stateRoot: api.state.path.state,
              scope: configuration.storageScope,
            })
          : undefined;
        const sessionId = readRouteSessionId(params);

        return createComponent(TreeRoute, {
          api,
          projectRoot,
          storageRoot,
          sessionId,
          summaryModel: configuration.model ?? readSummaryModel(api.state.config.small_model),
          summaryVariant: configuration.variant,
          navigateToSession: (targetSessionId) => {
            api.route.navigate("session", { sessionID: targetSessionId });
          },
        });
      },
    },
  ]);

  api.lifecycle.onDispose(() => {
    disposeRoute();
    disposePalette();
  });
};

function resolveProjectRoot(path: { readonly worktree: string; readonly directory: string }) {
  const worktree = path.worktree.trim();
  if (worktree && worktree !== "/") return worktree;
  const directory = path.directory.trim();
  return directory || undefined;
}

function isSessionRoute(
  route: TuiRouteCurrent,
): route is Extract<TuiRouteCurrent, { name: "session" }> {
  return route.name === "session";
}

function treeRouteParams(route: TuiRouteCurrent): Record<string, unknown> | undefined {
  return isSessionRoute(route) ? { sessionID: route.params.sessionID } : undefined;
}

function readRouteSessionId(params: Record<string, unknown> | undefined): string | undefined {
  const sessionId = params?.sessionID;
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined;
}

export default {
  id: PLUGIN_ID,
  tui,
} satisfies TuiPluginModule & { id: string };
