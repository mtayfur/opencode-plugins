import { z } from "zod";
import type { SummaryModel } from "./adapters/opencode-gateway";
import type { StorageScope } from "./adapters/tree-repository";

const modelSchema = z
  .string()
  .trim()
  .transform((value, context): SummaryModel | typeof z.NEVER => {
    const separator = value.indexOf("/");
    if (separator <= 0 || separator === value.length - 1) {
      context.addIssue({
        code: "custom",
        message: "model must use provider/model-id format",
      });
      return z.NEVER;
    }

    return {
      providerID: value.slice(0, separator),
      modelID: value.slice(separator + 1),
    };
  });

const configurationSchema = z
  .object({
    storageScope: z.enum(["global", "local"]).default("global"),
    model: modelSchema.optional(),
    variant: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type PluginConfiguration = {
  readonly storageScope: StorageScope;
  readonly model?: SummaryModel;
  readonly variant?: string;
};

export function readPluginConfiguration(value: unknown): PluginConfiguration {
  const parsed = configurationSchema.parse(value ?? {});
  return {
    storageScope: parsed.storageScope,
    ...(parsed.model ? { model: parsed.model } : {}),
    ...(parsed.variant ? { variant: parsed.variant } : {}),
  };
}

export function readSummaryModel(value: string | undefined): SummaryModel | undefined {
  return modelSchema.optional().parse(value);
}
