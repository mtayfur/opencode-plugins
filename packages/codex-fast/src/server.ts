import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { readFastMode } from "./state";

const PLUGIN_ID = "mtayfur.codex-fast";
const FETCH_RUNTIME_SYMBOL = Symbol.for("@mtayfur/opencode-codex-fast.fetch-runtime.v1");

type ReadEnabled = () => Promise<boolean>;

type FetchRuntime = {
  original: typeof globalThis.fetch;
  wrapper: typeof globalThis.fetch;
  references: number;
};

export function installFetchInterceptor(readEnabled: ReadEnabled = readFastMode): () => void {
  const host = globalThis as unknown as Record<PropertyKey, unknown>;
  const current = host[FETCH_RUNTIME_SYMBOL];
  const existing = isFetchRuntime(current) ? current : undefined;
  const runtime = existing ?? createFetchRuntime(globalThis.fetch, readEnabled);

  if (existing) {
    const wasInactive = runtime.references === 0;
    runtime.references += 1;
    if (wasInactive && globalThis.fetch === runtime.original) globalThis.fetch = runtime.wrapper;
  } else {
    host[FETCH_RUNTIME_SYMBOL] = runtime;
    globalThis.fetch = runtime.wrapper;
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    runtime.references = Math.max(0, runtime.references - 1);
    if (runtime.references !== 0 || globalThis.fetch !== runtime.wrapper) return;

    globalThis.fetch = runtime.original;
    if (host[FETCH_RUNTIME_SYMBOL] === runtime) delete host[FETCH_RUNTIME_SYMBOL];
  };
}

function createFetchRuntime(original: typeof globalThis.fetch, readEnabled: ReadEnabled): FetchRuntime {
  let runtime: FetchRuntime;
  const wrapper: typeof globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1],
    ) => {
      if (runtime.references === 0 || !isCodexEndpoint(input)) {
        return original.call(globalThis, input, init);
      }

      const enabled = await safelyReadEnabled(readEnabled);
      if (!enabled || typeof init?.body !== "string") {
        return original.call(globalThis, input, init);
      }

      const body = parseObject(init.body);
      if (!body || body.service_tier === "priority") {
        return original.call(globalThis, input, init);
      }

      return original.call(globalThis, input, {
        ...init,
        body: JSON.stringify({ ...body, service_tier: "priority" }),
      });
    },
    { preconnect: original.preconnect },
  );

  runtime = { original, wrapper, references: 1 };
  return runtime;
}

function isCodexEndpoint(input: Parameters<typeof globalThis.fetch>[0]): boolean {
  try {
    const url = new URL(requestUrl(input));
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.pathname === "/backend-api/codex/responses"
    );
  } catch {
    return false;
  }
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function safelyReadEnabled(readEnabled: ReadEnabled): Promise<boolean> {
  try {
    return await readEnabled();
  } catch {
    return false;
  }
}

function parseObject(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function isFetchRuntime(value: unknown): value is FetchRuntime {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FetchRuntime>;
  return (
    typeof candidate.original === "function" &&
    typeof candidate.wrapper === "function" &&
    typeof candidate.references === "number"
  );
}

const server: Plugin = async () => {
  const dispose = installFetchInterceptor();
  return {
    dispose: async () => dispose(),
  };
};

export default {
  id: PLUGIN_ID,
  server,
} satisfies PluginModule & { id: string };
