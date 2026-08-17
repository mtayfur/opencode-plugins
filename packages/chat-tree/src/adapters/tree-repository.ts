import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z, type ZodType } from "zod";
import {
  attachBranch,
  createRootSnapshot,
  createTreeId,
  STORAGE_FORMAT_VERSION,
  type TreeNode,
  type TreeSnapshot,
} from "../core/tree";

export type StorageScope = "global" | "local";

export type TreeContext =
  | {
      readonly kind: "missing-session";
      readonly projectRoot: string;
    }
  | {
      readonly kind: "ready";
      readonly projectRoot: string;
      readonly snapshot: TreeSnapshot;
    };

class TreeStorageError extends Error {
  readonly filePath: string;
  readonly kind: "invalid-json" | "invalid-schema" | "read" | "write";

  constructor(
    message: string,
    filePath: string,
    kind: "invalid-json" | "invalid-schema" | "read" | "write",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TreeStorageError";
    this.filePath = filePath;
    this.kind = kind;
  }
}

const treeIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("\0"),
    { message: "treeId must be a safe path segment" },
  );

const sessionIdSchema = z.string().min(1);
const messageIdSchema = z.string().min(1);

const treeNodeSchema: ZodType<TreeNode> = z
  .object({
    sessionId: sessionIdSchema,
    parentSessionId: sessionIdSchema.nullable(),
    anchorMessageId: messageIdSchema.nullable(),
    children: z.array(sessionIdSchema),
  })
  .strict();

const registrySchema = z
  .object({
    version: z.literal(STORAGE_FORMAT_VERSION),
    sessions: z.record(sessionIdSchema, treeIdSchema),
  })
  .strict();

const snapshotSchema: ZodType<TreeSnapshot> = z
  .object({
    version: z.literal(STORAGE_FORMAT_VERSION),
    treeId: treeIdSchema,
    rootSessionId: sessionIdSchema,
    sessions: z.record(sessionIdSchema, treeNodeSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const sessionEntries = Object.entries(snapshot.sessions);
    const childIdsBySessionId = new Map<string, ReadonlySet<string>>();

    for (const [sessionKey, node] of sessionEntries) {
      const childIds = new Set(node.children);
      childIdsBySessionId.set(sessionKey, childIds);

      if (childIds.size !== node.children.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "children must not contain duplicates",
          path: ["sessions", sessionKey, "children"],
        });
      }
    }

    const rootNode = getOwn(snapshot.sessions, snapshot.rootSessionId);
    if (!rootNode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rootSessionId ${snapshot.rootSessionId} is missing from sessions`,
        path: ["rootSessionId"],
      });
      return;
    }

    if (rootNode.parentSessionId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "root session must have parentSessionId null",
        path: ["sessions", snapshot.rootSessionId, "parentSessionId"],
      });
    }

    if (rootNode.anchorMessageId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "root session must have anchorMessageId null",
        path: ["sessions", snapshot.rootSessionId, "anchorMessageId"],
      });
    }

    const reachableSessionIds = new Set<string>();
    const pendingSessionIds = [snapshot.rootSessionId];

    while (pendingSessionIds.length > 0) {
      const sessionId = pendingSessionIds.pop();
      if (sessionId === undefined || reachableSessionIds.has(sessionId)) {
        continue;
      }

      const node = getOwn(snapshot.sessions, sessionId);
      if (!node) {
        continue;
      }

      reachableSessionIds.add(sessionId);
      pendingSessionIds.push(...node.children);
    }

    for (const [sessionKey] of sessionEntries) {
      if (!reachableSessionIds.has(sessionKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `session ${sessionKey} is not reachable from root session ${snapshot.rootSessionId}`,
          path: ["sessions", sessionKey],
        });
      }
    }

    for (const [sessionKey, node] of sessionEntries) {
      if (node.sessionId !== sessionKey) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `session key ${sessionKey} must match sessionId ${node.sessionId}`,
          path: ["sessions", sessionKey, "sessionId"],
        });
      }

      if (node.parentSessionId === node.sessionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "session cannot be its own parent",
          path: ["sessions", sessionKey, "parentSessionId"],
        });
      }

      if (sessionKey !== snapshot.rootSessionId && node.parentSessionId === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-root session must have parentSessionId",
          path: ["sessions", sessionKey, "parentSessionId"],
        });
      }

      if (sessionKey !== snapshot.rootSessionId && node.anchorMessageId === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-root session must have anchorMessageId",
          path: ["sessions", sessionKey, "anchorMessageId"],
        });
      }

      if (node.parentSessionId !== null) {
        const parentNode = getOwn(snapshot.sessions, node.parentSessionId);
        const parentChildIds = childIdsBySessionId.get(node.parentSessionId);

        if (!parentNode) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `parent session ${node.parentSessionId} is missing`,
            path: ["sessions", sessionKey, "parentSessionId"],
          });
        } else if (!parentChildIds?.has(node.sessionId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `parent session ${node.parentSessionId} must list ${node.sessionId} in children`,
            path: ["sessions", node.parentSessionId, "children"],
          });
        }
      }

      for (const [childIndex, childSessionId] of node.children.entries()) {
        const childNode = getOwn(snapshot.sessions, childSessionId);

        if (!childNode) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `child session ${childSessionId} is missing`,
            path: ["sessions", sessionKey, "children", childIndex],
          });
          continue;
        }

        if (childNode.parentSessionId !== node.sessionId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `child session ${childSessionId} must point back to parent ${node.sessionId}`,
            path: ["sessions", childSessionId, "parentSessionId"],
          });
        }
      }
    }
  });

type TreeRegistry = z.infer<typeof registrySchema>;

export function resolveTreeStorageRoot(input: {
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly scope: StorageScope;
}): string {
  const projectRoot = requireNonEmptyPath(input.projectRoot, "projectRoot");

  if (input.scope === "local") {
    return join(projectRoot, ".opencode", "opencode-chat-tree");
  }

  if (input.scope !== "global") {
    throw new Error(`Invalid storage scope ${String(input.scope)}`);
  }

  const stateRoot = requireNonEmptyPath(input.stateRoot, "stateRoot");
  const projectSlug = toProjectSlug(projectRoot);
  const projectHash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);

  return join(
    stateRoot,
    "plugins",
    "opencode-chat-tree",
    "projects",
    `${projectSlug}-${projectHash}`,
  );
}

export class TreeRepository {
  private readonly storageRoot: string;

  constructor(storageRoot: string) {
    this.storageRoot = requireNonEmptyPath(storageRoot, "storageRoot");
  }

  async open(projectRoot: string, sessionId?: string): Promise<TreeContext> {
    if (!sessionId) {
      return {
        kind: "missing-session",
        projectRoot,
      };
    }

    const registry = await readRegistry(this.storageRoot);
    const existingTreeId = getOwn(registry.sessions, sessionId);

    if (existingTreeId !== undefined) {
      const snapshotFilePath = getSnapshotFilePath(this.storageRoot, existingTreeId);
      const snapshot = await readJsonFile(snapshotFilePath, snapshotSchema);

      if (snapshot.treeId !== existingTreeId) {
        throw new TreeStorageError(
          `Snapshot treeId ${snapshot.treeId} does not match registry treeId ${existingTreeId}`,
          snapshotFilePath,
          "invalid-schema",
        );
      }

      if (!getOwn(snapshot.sessions, sessionId)) {
        throw new TreeStorageError(
          `Registry session ${sessionId} is not present in snapshot ${existingTreeId}`,
          snapshotFilePath,
          "invalid-schema",
        );
      }

      return {
        kind: "ready",
        projectRoot,
        snapshot,
      };
    }

    const treeId = createTreeId();
    const snapshot = createRootSnapshot(treeId, sessionId);
    const nextRegistry = registerSessionTree(registry, sessionId, treeId);

    await writeSnapshot(this.storageRoot, snapshot);
    await writeRegistry(this.storageRoot, nextRegistry);

    return {
      kind: "ready",
      projectRoot,
      snapshot,
    };
  }

  async saveBranch(
    snapshot: TreeSnapshot,
    input: {
      readonly sessionId: string;
      readonly parentSessionId: string;
      readonly anchorMessageId: string;
    },
  ): Promise<void> {
    const snapshotFilePath = getSnapshotFilePath(this.storageRoot, snapshot.treeId);
    const currentSnapshot = validateSnapshot(snapshot, snapshotFilePath);
    const nextSnapshot = validateSnapshot(attachBranch(currentSnapshot, input), snapshotFilePath);
    const registry = await readRegistry(this.storageRoot);
    const nextRegistry = registerSessionTree(registry, input.sessionId, currentSnapshot.treeId);

    await writeJsonFile(snapshotFilePath, snapshotSchema, nextSnapshot);

    try {
      await writeRegistry(this.storageRoot, nextRegistry);
    } catch (error) {
      try {
        await writeJsonFile(snapshotFilePath, snapshotSchema, currentSnapshot);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Failed to update ${getRegistryFilePath(this.storageRoot)} and roll back ${snapshotFilePath}`,
        );
      }

      throw error;
    }
  }
}

function requireNonEmptyPath(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing ${label}`);
  }

  return normalized;
}

function toProjectSlug(projectRoot: string): string {
  const slug = basename(projectRoot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

function getRegistryFilePath(storageRoot: string): string {
  return join(storageRoot, "registry.json");
}

function getSnapshotFilePath(storageRoot: string, treeId: unknown): string {
  const treesRoot = join(storageRoot, "trees");
  const parsedTreeId = treeIdSchema.safeParse(treeId);

  if (!parsedTreeId.success) {
    throw new TreeStorageError("treeId must be a safe path segment", treesRoot, "invalid-schema");
  }

  return join(treesRoot, parsedTreeId.data, "snapshot.json");
}

async function readRegistry(storageRoot: string): Promise<TreeRegistry> {
  const filePath = getRegistryFilePath(storageRoot);

  try {
    return await readJsonFile(filePath, registrySchema);
  } catch (error) {
    if (isEnoent(error)) {
      return {
        version: STORAGE_FORMAT_VERSION,
        sessions: {},
      };
    }

    throw error;
  }
}

async function writeRegistry(storageRoot: string, registry: TreeRegistry): Promise<void> {
  await writeJsonFile(getRegistryFilePath(storageRoot), registrySchema, registry);
}

async function writeSnapshot(storageRoot: string, snapshot: TreeSnapshot): Promise<void> {
  const filePath = getSnapshotFilePath(storageRoot, snapshot.treeId);
  await writeJsonFile(filePath, snapshotSchema, snapshot);
}

function validateSnapshot(value: unknown, filePath: string): TreeSnapshot {
  return parseStoredValue(filePath, snapshotSchema, value);
}

function registerSessionTree(
  registry: TreeRegistry,
  sessionId: string,
  treeId: string,
): TreeRegistry {
  const existingTreeId = getOwn(registry.sessions, sessionId);

  if (existingTreeId === undefined) {
    return {
      ...registry,
      sessions: {
        ...registry.sessions,
        [sessionId]: treeId,
      },
    };
  }

  if (existingTreeId !== treeId) {
    throw new Error(`Session ${sessionId} is already registered to tree ${existingTreeId}`);
  }

  return registry;
}

async function readJsonFile<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new TreeStorageError(`Failed to read ${filePath}`, filePath, "read", {
      cause: error,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new TreeStorageError(`Invalid JSON in ${filePath}`, filePath, "invalid-json", {
      cause: error,
    });
  }

  return parseStoredValue(filePath, schema, value);
}

async function writeJsonFile<T>(filePath: string, schema: ZodType<T>, value: T): Promise<void> {
  const parsed = parseStoredValue(filePath, schema, value);

  let tempFilePath: string | undefined;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    tempFilePath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(tempFilePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(tempFilePath, filePath);
  } catch (error) {
    if (tempFilePath) {
      await rm(tempFilePath, { force: true }).catch(() => undefined);
    }

    throw new TreeStorageError(`Failed to write ${filePath}`, filePath, "write", {
      cause: error,
    });
  }
}

function parseStoredValue<T>(filePath: string, schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TreeStorageError(`Invalid storage schema in ${filePath}`, filePath, "invalid-schema");
  }

  return parsed.data;
}

function isEnoent(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  ) {
    return true;
  }

  if (error instanceof TreeStorageError && error.cause !== undefined) {
    return isEnoent(error.cause);
  }

  return false;
}
function getOwn<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
