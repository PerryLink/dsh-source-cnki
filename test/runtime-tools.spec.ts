/**
 * Runtime and tool surface: evidence, path safety, citations.
 * @module test/runtime-tools.spec
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateRep } from '@perrylink/dsh-research-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import type { BibRecord } from '../src/formats.ts'
import { SourceRuntime } from '../src/runtime.ts'
import { makeCnkiCheckTool } from '../src/tools/cnki-check.ts'
import { makeCnkiCiteTool } from '../src/tools/cnki-cite.ts'
import { makeCnkiImportTool } from '../src/tools/cnki-import.ts'
import { VERSION } from '../src/version.ts'

const AT = new Date('2026-10-20T09:00:00.000Z')
const RIS = `TY  - JOUR
AU  - 张三
AU  - 李四
TI  - 测试论文
JO  - 中国科学
PY  - 2021
VL  - 42
IS  - 3
SP  - 15
EP  - 20
DO  - 10.1234/synth.2021.001
ER  -
`
let workspace: string
let store: string

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'cnki-work-'))
  store = await mkdtemp(path.join(tmpdir(), 'cnki-store-'))
  await writeFile(path.join(workspace, 'export.ris'), RIS, 'utf8')
})

afterEach(async () => {
  for (const directory of [workspace, store]) {
    if (directory.startsWith(tmpdir())) await rm(directory, { recursive: true, force: true })
  }
})

/** Build a runtime over the fixtures. */
function runtime(): SourceRuntime {
  return new SourceRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store }), now: () => AT })
}

const EXEC = {} as never

describe('runtime', () => {
  it('imports a RIS export and writes a valid REP record', async () => {
    const result = await runtime().import({ path: 'export.ris' })
    expect(result.records).toHaveLength(1)
    expect(result.validation.ok).toBe(true)
    expect(result.evidenceId).toMatch(/^ev-/u)
    const record = JSON.parse(await readFile(result.recordPath!, 'utf8')) as unknown
    expect(validateRep(record).ok, JSON.stringify(validateRep(record).issues)).toBe(true)
  })

  it('cites and validates imported records', async () => {
    const { records } = await runtime().import({ path: 'export.ris', persist: false })
    const citations = runtime().cite(records, { style: 'gbt7714-numeric' })
    expect(citations[0]).toContain('[1] 张三, 李四. 测试论文[J]. 中国科学, 2021, 42(3): 15–20.')
    expect(runtime().check(records).ok).toBe(true)
  })

  it('rejects traversal, docx, oversize and empty exports', async () => {
    await expect(runtime().import({ path: '../escape.ris' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    await writeFile(path.join(workspace, 'export.docx'), 'docx', 'utf8')
    await expect(runtime().import({ path: 'export.docx' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
    const tiny = new SourceRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store, maxChars: 10 }), now: () => AT })
    await expect(tiny.import({ text: RIS })).rejects.toMatchObject({ code: 'TOO_LARGE' })
    await expect(runtime().import({ text: '   ' })).rejects.toBeInstanceOf(Error)
  })
})

describe('tools', () => {
  it('declares names and schemas', () => {
    for (const [tool, name] of [
      [makeCnkiImportTool(runtime()), 'cnki_import'],
      [makeCnkiCiteTool(runtime()), 'cnki_cite'],
      [makeCnkiCheckTool(runtime()), 'cnki_check'],
    ] as const) {
      expect(tool.name).toBe(name)
      expect(Object.keys(tool.parameters).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
    }
  })

  it('import → cite → check end to end', async () => {
    const imported = (await makeCnkiImportTool(runtime()).execute({ path: 'export.ris' }, EXEC)) as { ok: true; records: BibRecord[] }
    expect(imported.ok).toBe(true)

    const cited = (await makeCnkiCiteTool(runtime()).execute({ records: imported.records, style: 'apa' }, EXEC)) as { ok: true; citations: string[]; text: string }
    expect(cited.citations).toHaveLength(1)
    expect(cited.text).toContain('测试论文')

    const checked = (await makeCnkiCheckTool(runtime()).execute({ records: imported.records }, EXEC)) as { ok: true; validation: { ok: boolean } }
    expect(checked.validation.ok).toBe(true)
  })

  it('failure branches carry stable codes', async () => {
    const missing = (await makeCnkiImportTool(runtime()).execute({}, EXEC)) as { ok: false; error: { code: string } }
    expect(missing.error.code).toBe('INVALID_INPUT')
    const noRecords = (await makeCnkiImportTool(runtime()).execute({ text: 'nothing to see here' }, EXEC)) as { ok: false; error: { code: string } }
    expect(noRecords.error.code).toBe('NO_RECORDS')
    const noCite = (await makeCnkiCiteTool(runtime()).execute({ records: [] }, EXEC)) as { ok: false; error: { code: string } }
    expect(noCite.error.code).toBe('INVALID_INPUT')
  })
})

describe('package', () => {
  it('VERSION matches package.json and the manifest declares a bundle patch', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    expect(pkg['version']).toBe(VERSION)
    expect(pkg['dsh']).toEqual({ manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } })
    expect(pkg['dependencies']).toEqual({})
  })
})
