#!/usr/bin/env bun

import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

const configFile = resolve(homedir(), ".config/opencode/tui.json")
const action = process.argv[2]
const pluginPath = process.argv[3]

if ((action !== "install" && action !== "uninstall") || !pluginPath) {
  throw new Error("Usage: configure-plugin.ts <install|uninstall> <plugin-path>")
}

const localEntry = pathToFileURL(resolve(pluginPath)).href
const file = Bun.file(configFile)
const contents = (await file.exists()) ? await file.text() : ""
const source = contents.trim() === "" ? "{}\n" : contents
const errors: ParseError[] = []
const config: unknown = parse(source, errors, { allowTrailingComma: true })

if (errors.length > 0) throw new Error(`Invalid JSONC in ${configFile}`)
if (!isRecord(config)) throw new Error(`${configFile} must contain a JSON object.`)

const current = config.plugin ?? []
if (!Array.isArray(current)) throw new Error(`${configFile}.plugin must be an array.`)

const index = current.findIndex((entry) => entryName(entry) === localEntry)
if (action === "uninstall" && index < 0) {
  console.log("Local plugin is not registered; nothing to change.")
  process.exit(0)
}

const next = action === "install"
  ? index < 0
    ? [...current, localEntry]
    : current
  : current.filter((_, entryIndex) => entryIndex !== index)

if (JSON.stringify(current) === JSON.stringify(next)) {
  console.log("Plugin configuration is already up to date.")
  process.exit(0)
}

const edits = modify(source, ["plugin"], next, {
  formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
})
const updated = applyEdits(source, edits)
const output = updated.endsWith("\n") ? updated : `${updated}\n`

await mkdir(dirname(configFile), { recursive: true })
await Bun.write(configFile, output)

console.log(action === "install" ? "Local plugin registered." : "Local plugin removed.")

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function entryName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
  return undefined
}
