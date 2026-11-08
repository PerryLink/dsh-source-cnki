/**
 * `dsh-source-cnki` — Chinese-literature export import, citation formatting and
 * structural validation.
 *
 * No login, no scraping, no CNKI API: it reads what the user exported (RIS or
 * labeled text) and formats GB/T 7714 / APA citations. Three tools:
 * cnki_import, cnki_cite, cnki_check.
 *
 * Function plugin — no default export.
 * @module dsh-source-cnki
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type Config as ConfigShape } from './config.ts'
import { SourceRuntime, type EvidencePort } from './runtime.ts'
import { makeCnkiCheckTool } from './tools/cnki-check.ts'
import { makeCnkiCiteTool } from './tools/cnki-cite.ts'
import { makeCnkiImportTool } from './tools/cnki-import.ts'

/** Cordis plugin name. */
export const name = 'source-cnki'

/** The tool registry is required; the REP service is optional. */
export const inject = ['tools']

export { Config, resolveConfig }
export type { ConfigShape }
export type { ResolvedConfig } from './config.ts'
export { VERSION } from './version.ts'
export { formatBibliography, formatCitation } from './cite.ts'
export type { CiteOptions, CiteStyle } from './cite.ts'
export { importRecords, ImportError, parseLabeled, parseRis, recordIdOf } from './formats.ts'
export type { ImportErrorCode, BibRecord } from './formats.ts'
export { validateRecords } from './validate.ts'
export type { RecordIssue, ValidationResult } from './validate.ts'
export { SourceError, SourceRuntime } from './runtime.ts'
export type { EvidencePort, ImportValue, SourceErrorCode, SourceRuntimeOptions } from './runtime.ts'
export { makeCnkiImportTool } from './tools/cnki-import.ts'
export { makeCnkiCiteTool } from './tools/cnki-cite.ts'
export { makeCnkiCheckTool } from './tools/cnki-check.ts'

/**
 * Mount the three tools.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('source-cnki')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no tools are mounted')
    return
  }
  const service = ctx.get('researchEvidence') as EvidencePort | undefined
  const runtime = new SourceRuntime({ config: resolved, ...(service === undefined ? {} : { service }) })
  if (service === undefined) {
    logger.info(`ctx.researchEvidence is not mounted; using a local core store under ${resolved.root}`)
  }
  ctx.effect(() => ctx.tools.register(makeCnkiImportTool(runtime)), 'source-cnki: cnki_import tool')
  ctx.effect(() => ctx.tools.register(makeCnkiCiteTool(runtime)), 'source-cnki: cnki_cite tool')
  ctx.effect(() => ctx.tools.register(makeCnkiCheckTool(runtime)), 'source-cnki: cnki_check tool')
}
