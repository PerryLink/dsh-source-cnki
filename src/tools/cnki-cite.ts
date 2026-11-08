/**
 * `cnki_cite` — GB/T 7714 or APA citations.
 * @module dsh-source-cnki/tools/cnki-cite
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
    citations: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `cnki_cite` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeCnkiCiteTool(runtime: SourceRuntime) {
  return defineTool({
    name: 'cnki_cite',
    description: [
      'Format imported records as a bibliography (dsh-source-cnki).',
      '',
      'Styles: `gbt7714-numeric` (顺序编码制, default), `gbt7714` (same without the [n] prefix), `apa` (7th). Only fields present in the record are emitted — no publisher, place or page range is invented; author lists follow GB/T (≤3 all, otherwise first 3 + 等/et al) and APA (Surname, I.) rules.',
    ].join('\n'),
    parameters: {
      records: { type: 'json', required: true, description: 'Records from cnki_import.' },
      style: { type: 'string', enum: ['gbt7714', 'gbt7714-numeric', 'apa'], description: 'Citation style.' },
      startIndex: { type: 'integer', description: 'First number for the numeric style (default 1).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; text: string } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `cnki_cite failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: result.text }]
      },
    },
    async execute(args: unknown) {
      const request = args as { records?: BibRecord[]; style?: 'gbt7714' | 'gbt7714-numeric' | 'apa'; startIndex?: number }
      try {
        const citations = runtime.cite(request.records ?? [], {
          ...(request.style === undefined ? {} : { style: request.style }),
          ...(request.startIndex === undefined ? {} : { startIndex: request.startIndex }),
        })
        return { ok: true as const, citations: [...citations], text: citations.join('\n') }
      } catch (error) {
        if (error instanceof SourceError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
