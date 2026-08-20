/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { useKeyboard } from "@opentui/solid";
import { createMemo, createSignal, For, type Accessor } from "solid-js";
import type {
  OpenCodeTreeGateway,
  SummaryModel,
  SummaryRequest,
} from "../adapters/opencode-gateway";
import { collectSummaryMessages, type BranchPlan } from "../core/branching";
import type { TreeRow } from "../core/projection";
import type { TranscriptMap } from "../core/transcript";
import type { TreeSnapshot } from "../core/tree";

const SUMMARY_CANCELLED_MESSAGE = "Summary generation cancelled.";

type BranchChoice = "no-summary" | "summarize";

const branchOptions: readonly {
  readonly title: string;
  readonly value: BranchChoice;
}[] = [
  {
    title: "Branch without handoff",
    value: "no-summary",
  },
  {
    title: "Generate handoff and branch",
    value: "summarize",
  },
];

type BranchWorkflowApi = {
  readonly ui: Pick<TuiPluginApi["ui"], "dialog" | "toast">;
  readonly theme: Pick<TuiPluginApi["theme"], "current">;
};

type BranchWorkflowState =
  | {
      readonly kind: "branching";
    }
  | {
      readonly kind: "summarizing";
      readonly controller: AbortController;
    };

export type CreateBranchWorkflowInput = {
  readonly api: BranchWorkflowApi;
  readonly gateway: () => OpenCodeTreeGateway | undefined;
  readonly snapshot: () => TreeSnapshot | undefined;
  readonly transcripts: () => TranscriptMap | undefined;
  readonly selectedRow: () => TreeRow | undefined;
  readonly summaryModel?: SummaryModel;
  readonly summaryVariant?: string;
  readonly navigateToSession: (sessionId: string) => void | Promise<void>;
};

export type BranchWorkflow = {
  readonly busy: Accessor<boolean>;
  readonly errorMessage: Accessor<string | undefined>;
  readonly open: (plan: BranchPlan) => void;
  readonly dispose: () => void;
};

export function createBranchWorkflow(input: CreateBranchWorkflowInput): BranchWorkflow {
  const [state, setState] = createSignal<BranchWorkflowState | undefined>();
  const [errorMessage, setErrorMessage] = createSignal<string | undefined>();
  const busy = createMemo(() => state() !== undefined);
  let operationId = 0;

  const clearDialog = () => {
    if (input.api.ui.dialog.open) input.api.ui.dialog.clear();
  };

  const cancelSummary = () => {
    const currentState = state();
    if (currentState?.kind !== "summarizing") return;
    currentState.controller.abort();
  };

  const showSelection = (plan: BranchPlan) => {
    input.api.ui.dialog.setSize("large");
    input.api.ui.dialog.replace(() => (
      <BranchChoiceDialog
        api={input.api}
        onSelect={(choice) => {
          if (choice === "no-summary") runBranch(plan);
          else runSummary(plan);
        }}
      />
    ));
  };

  const failBranch = (error: unknown) => {
    setErrorMessage(toErrorMessage(error));
    clearDialog();
  };

  const formatSummaryFailure = (error: unknown): string | undefined => {
    const message = toErrorMessage(error);
    return message === SUMMARY_CANCELLED_MESSAGE ? undefined : `Summary failed: ${message}`;
  };

  const failSummary = (error: unknown) => {
    const message = formatSummaryFailure(error);
    if (message) setErrorMessage(message);
    clearDialog();
  };

  const runBranch = (plan: BranchPlan) => {
    if (busy()) return;

    const gateway = input.gateway();
    if (!gateway) {
      failBranch("Branch gateway is unavailable.");
      return;
    }

    const snapshot = input.snapshot();
    if (!snapshot) {
      failBranch("Tree snapshot is unavailable.");
      return;
    }

    const currentOperationId = ++operationId;
    setErrorMessage(undefined);
    setState({ kind: "branching" });
    clearDialog();

    void executeBranch({
      currentOperationId,
      gateway,
      plan,
      snapshot,
    });
  };

  const runSummary = (plan: BranchPlan) => {
    if (busy()) return;

    const gateway = input.gateway();
    if (!gateway) {
      failSummary("Branch gateway is unavailable.");
      return;
    }

    const snapshot = input.snapshot();
    if (!snapshot) {
      failSummary("Tree snapshot is unavailable.");
      return;
    }

    const transcripts = input.transcripts();
    if (!transcripts) {
      failSummary("Tree transcripts are unavailable.");
      return;
    }

    if (!input.summaryModel) {
      failSummary("OpenCode small_model is not configured.");
      return;
    }

    let messages: ReturnType<typeof collectSummaryMessages>;
    try {
      messages = collectSummaryMessages(input.selectedRow(), transcripts);
    } catch (error) {
      failSummary(error);
      return;
    }

    const controller = new AbortController();
    const currentOperationId = ++operationId;
    const summaryRequest: SummaryRequest = {
      messages,
      signal: controller.signal,
      model: input.summaryModel,
      ...(input.summaryVariant ? { variant: input.summaryVariant } : {}),
    };

    setErrorMessage(undefined);
    setState({ kind: "summarizing", controller });
    showSummaryProgress(currentOperationId);

    void executeBranch({
      currentOperationId,
      gateway,
      plan,
      snapshot,
      summaryRequest,
    });
  };

  const showSummaryProgress = (currentOperationId: number) => {
    input.api.ui.dialog.replace(
      () => (
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={1}>
          <text>Generating branch handoff summary...</text>
          <text>Press Esc to cancel.</text>
        </box>
      ),
      () => {
        if (operationId !== currentOperationId) return;
        cancelSummary();
      },
    );
  };

  const executeBranch = async (operation: {
    readonly currentOperationId: number;
    readonly gateway: OpenCodeTreeGateway;
    readonly snapshot: TreeSnapshot;
    readonly plan: BranchPlan;
    readonly summaryRequest?: SummaryRequest;
  }): Promise<void> => {
    try {
      const branch = await operation.gateway.createBranch(
        operation.snapshot,
        operation.plan,
        operation.summaryRequest,
      );

      await operation.gateway.enterBranch(branch, input.navigateToSession);
    } catch (error) {
      const message = operation.summaryRequest
        ? formatSummaryFailure(error)
        : toErrorMessage(error);
      if (message) input.api.ui.toast({ message, variant: "error" });
      if (operation.currentOperationId !== operationId) return;

      if (message) setErrorMessage(message);
    } finally {
      if (operation.currentOperationId !== operationId) return;

      setState(undefined);
      clearDialog();
    }
  };

  const open = (plan: BranchPlan) => {
    if (busy()) return;

    setErrorMessage(undefined);
    showSelection(plan);
  };

  const dispose = () => {
    operationId += 1;
    cancelSummary();
    clearDialog();
    setState(undefined);
  };

  return {
    busy,
    errorMessage,
    open,
    dispose,
  };
}

function BranchChoiceDialog(props: {
  readonly api: BranchWorkflowApi;
  readonly onSelect: (choice: BranchChoice) => void;
}) {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const theme = () => props.api.theme.current;

  useKeyboard((key) => {
    if (key.defaultPrevented) return;

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((index) => (index === 0 ? branchOptions.length - 1 : index - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((index) => (index + 1) % branchOptions.length);
    } else if (key.name === "return") {
      const option = branchOptions[selectedIndex()];
      if (!option) return;
      props.onSelect(option.value);
    } else {
      return;
    }

    key.preventDefault();
    key.stopPropagation();
  });

  return (
    <box flexDirection="column" paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="flex-end" paddingRight={4} width="100%">
        <text fg={theme().textMuted} onMouseUp={() => props.api.ui.dialog.clear()}>
          esc
        </text>
      </box>

      <For each={branchOptions}>
        {(option, index) => {
          const active = () => index() === selectedIndex();
          const select = () => props.onSelect(option.value);

          return (
            <box
              flexDirection="row"
              justifyContent="center"
              paddingLeft={4}
              paddingRight={4}
              backgroundColor={active() ? theme().primary : theme().background}
              onMouseOver={() => setSelectedIndex(index())}
              onMouseUp={select}
            >
              <text fg={active() ? theme().selectedListItemText : theme().text}>
                <b>{option.title}</b>
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }

  return String(error);
}
