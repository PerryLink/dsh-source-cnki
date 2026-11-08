/**
 * `cnki_check` — structural metadata validation.
 * @module dsh-source-cnki/tools/cnki-check
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { SourceError, type SourceRuntime } from '../runtime.ts'
import type { BibRecord } from '../formats.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    validation: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `cnki_check` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeCnkiCheckTool(runtime: SourceRuntime) {
  return defineTool({
    name: 'cnki_check',
    description: [
      'Validate imported Chinese-literature records (dsh-source-cnki).',
      '',
      'Structural checks only: missing title/journal/year/authors, implausible year, malformed DOI, non-numeric pages, duplicate records, and journal records without volume or issue. It does not verify that the record matches the real paper (use dsh-cite-verify for DOIs).',
    ].join('\n'),
    parameters: {
      records: { type: 'json', required: true, description: 'Records from cnki_import.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; validation: { records: number; ok: boolean; issues: Array<{ severity: string }> } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `cnki_check failed (${result.error.code}): ${result.error.message}` }]
        const errors = result.validation.issues.filter(issue => issue.severity === 'error').length
        return [{ type: 'text', text: `cnki_check: ${result.validation.records} record(s), ${errors} error(s), ${result.validation.issues.length - errors} warning(s)` }]
      },
    },
    async execute(args: unknown) {
      const request = args as { records?: BibRecord[] }
      try {
        return { ok: true as const, validation: runtime.check(request.records ?? []) as never }
      } catch (error) {
        if (error instanceof SourceError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
