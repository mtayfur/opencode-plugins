#!/usr/bin/env bun

import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const outputDirectory = resolve("dist")

await rm(outputDirectory, { recursive: true, force: true })

const build = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: outputDirectory,
  target: "bun",
  format: "esm",
  packages: "external",
  plugins: [createSolidTransformPlugin()],
})

if (!build.success) throw new AggregateError(build.logs, "Plugin bundle failed")
