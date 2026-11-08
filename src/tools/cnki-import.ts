/**
 * `cnki_import` — import exported records.
 * @module dsh-source-cnki/tools/cnki-import
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { SourceError, type SourceRuntime } from '../runtime.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    records: { type: 'json' },
    validation: { type: 'json' },
    evidenceId: { type: 'string' },
    recordPath: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `cnki_import` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeCnkiImportTool(runtime: SourceRuntime) {
  return defineTool({
    name: 'cnki_import',
    description: [
      'Import Chinese-literature records from a user export (dsh-source-cnki).',
      '',
      'Reads RIS/EndNote-style tagged text or a labeled text export (题名：/作者：/来源：), assigns stable record ids, and validates structure. It does NOT log in to CNKI, does NOT scrape, and does NOT call a CNKI API (none is public for this purpose): you export the records yourself.',
      '',
      'Missing fields are reported as missing, never guessed. The export is stored as REP evidence when persist is on.',
    ].join('\n'),
    parameters: {
      text: { type: 'string', description: 'Export text (mutually exclusive with path).' },
      path: { type: 'string', description: 'Workspace-relative .ris/.txt/.md export file.' },
      format: { type: 'string', enum: ['auto', 'ris', 'labeled'], description: 'Force a format instead of auto-detecting.' },
      persist: { type: 'boolean', description: 'Store the export as REP evidence + record (default true).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; records: unknown[]; validation: { ok: boolean; issues: unknown[] } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `cnki_import failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: `cnki_import: ${result.records.length} record(s); ${result.validation.issues.length} validation issue(s); structural ${result.validation.ok ? 'ok' : 'has errors'}` }]
      },
    },
    async execute(args: unknown) {
      const request = args as { text?: string; path?: string; format?: 'auto' | 'ris' | 'labeled'; persist?: boolean }
      try {
        const result = await runtime.import({
          ...(request.text === undefined ? {} : { text: request.text }),
          ...(request.path === undefined ? {} : { path: request.path }),
          ...(request.format === undefined ? {} : { format: request.format }),
          ...(request.persist === undefined ? {} : { persist: request.persist }),
        })
        return {
          ok: true as const,
          records: result.records as never,
          validation: result.validation as never,
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.recordPath === undefined ? {} : { recordPath: result.recordPath }),
        }
      } catch (error) {
        if (error instanceof SourceError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
