/**
 * Runtime: workspace-safe export loading, import with REP evidence, citation and
 * validation. No network: CNKI has no public API here and the plugin neither
 * logs in nor scrapes.
 * @module dsh-source-cnki/runtime
 */

import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EvidenceStore,
  RepStoreError,
  stableId,
  validateRep,
  type AddEvidenceInput,
  type CaptureInput,
  type CheckResult,
  type Evidence,
  type ResearchRecord,
  type Snapshot,
} from '@perrylink/dsh-research-core'
import type { ResolvedConfig } from './config.ts'
import { formatBibliography, type CiteOptions } from './cite.ts'
import { importRecords, ImportError, type BibRecord } from './formats.ts'
import { validateRecords, type ValidationResult } from './validate.ts'
import { VERSION } from './version.ts'

/** Stable error codes. */
export type SourceErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'PATH_ESCAPE' | 'NOT_A_FILE' | 'TOO_LARGE' | 'UNSUPPORTED_FILE' | 'NO_RECORDS' | 'STORE_ERROR'

/** A typed failure. */
export class SourceError extends Error {
  /** Stable code. */
  readonly code: SourceErrorCode

  constructor(code: SourceErrorCode, message: string) {
    super(message)
    this.name = 'SourceError'
    this.code = code
  }
}

/** The subset of the REP service used here. */
export interface EvidencePort {
  capture(input: CaptureInput): Promise<{ snapshot: Snapshot }>
  addEvidence(input: AddEvidenceInput): Promise<{ evidence: Evidence }>
  buildRecord(options?: { evidenceIds?: readonly string[] }): Promise<Omit<ResearchRecord, 'manifest'>>
}

/** Import result. */
export interface ImportValue {
  readonly records: readonly BibRecord[]
  readonly validation: ValidationResult
  readonly evidenceId?: string
  readonly recordPath?: string
}

/** Runtime options. */
export interface SourceRuntimeOptions {
  readonly config: ResolvedConfig
  readonly service?: EvidencePort
  readonly now?: () => Date
}

/** True when `candidate` is inside `root`. */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
}

/** Validate record objects arriving from the tool's JSON boundary. */
function assertRecords(value: unknown): BibRecord[] {
  if (!Array.isArray(value) || value.length === 0) throw new SourceError('INVALID_INPUT', 'pass at least one record')
  for (const item of value) {
    if (typeof item !== 'object' || item === null) throw new SourceError('INVALID_INPUT', 'every record must be an object from cnki_import')
    const record = item as Partial<BibRecord>
    if (typeof record.recordId !== 'string' || typeof record.title !== 'string') {
      throw new SourceError('INVALID_INPUT', 'every record needs recordId and title strings')
    }
    if (!Array.isArray(record.authors) || !record.authors.every(author => typeof author === 'string')) {
      throw new SourceError('INVALID_INPUT', 'record.authors must be an array of strings')
    }
    if (record.type !== 'journal' && record.type !== 'thesis' && record.type !== 'conference' && record.type !== 'book' && record.type !== 'other') {
      throw new SourceError('INVALID_INPUT', 'record.type must be journal, thesis, conference, book or other')
    }
    if (record.language !== 'zh' && record.language !== 'en' && record.language !== 'unknown') {
      throw new SourceError('INVALID_INPUT', 'record.language must be zh, en or unknown')
    }
    for (const field of ['journal', 'volume', 'issue', 'pages', 'doi', 'abstract'] as const) {
      if (record[field] !== undefined && typeof record[field] !== 'string') throw new SourceError('INVALID_INPUT', `record.${field} must be a string when present`)
    }
    if (record.year !== undefined && typeof record.year !== 'number') throw new SourceError('INVALID_INPUT', 'record.year must be a number when present')
    if (record.keywords !== undefined && (!Array.isArray(record.keywords) || !record.keywords.every(keyword => typeof keyword === 'string'))) {
      throw new SourceError('INVALID_INPUT', 'record.keywords must be an array of strings when present')
    }
  }
  return value as BibRecord[]
}

/** The runtime. */
export class SourceRuntime {
  readonly config: ResolvedConfig

  readonly #service: EvidencePort | undefined
  readonly #now: () => Date
  #store: EvidenceStore | undefined

  constructor(options: SourceRuntimeOptions) {
    this.config = options.config
    this.#service = options.service
    this.#now = options.now ?? (() => new Date())
  }

  /** Current ISO timestamp. */
  iso(): string {
    return this.#now().toISOString()
  }

  /** The evidence port. */
  port(): EvidencePort {
    if (this.#service !== undefined) return this.#service
    this.#store ??= new EvidenceStore(path.join(this.config.root, 'store'))
    return this.#store
  }

  /** Resolve a file inside the workspace. */
  async resolveFile(input: string): Promise<{ absolute: string; id: string }> {
    if (typeof input !== 'string' || input.trim() === '') throw new SourceError('INVALID_INPUT', 'path must be a non-empty string')
    let realRoot: string
    try {
      realRoot = await realpath(this.config.workspaceRoot)
    } catch {
      throw new SourceError('NOT_FOUND', `workspace root does not exist: ${this.config.workspaceRoot}`)
    }
    const candidate = path.resolve(realRoot, input)
    if (!isInside(realRoot, candidate)) throw new SourceError('PATH_ESCAPE', 'path resolves outside the workspace root')
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new SourceError('NOT_FOUND', `file not found: ${input}`)
    }
    if (!isInside(realRoot, real)) throw new SourceError('PATH_ESCAPE', 'path escapes the workspace root through a symlink')
    if (!(await stat(real)).isFile()) throw new SourceError('NOT_A_FILE', `not a regular file: ${input}`)
    return { absolute: real, id: path.relative(realRoot, real).split(path.sep).join('/') }
  }

  /**
   * Import exported records and optionally persist the export as evidence.
   * @param request - text/path, format and persistence.
   * @returns records and validation.
   */
  async import(request: { text?: string; path?: string; format?: 'auto' | 'ris' | 'labeled'; persist?: boolean }): Promise<ImportValue> {
    if ((request.text === undefined) === (request.path === undefined)) throw new SourceError('INVALID_INPUT', 'pass exactly one of text or path')
    if (request.text !== undefined && typeof request.text !== 'string') throw new SourceError('INVALID_INPUT', 'text must be a string')
    const format = request.format ?? 'auto'
    if (format !== 'auto' && format !== 'ris' && format !== 'labeled') throw new SourceError('INVALID_INPUT', 'format must be auto, ris or labeled')
    let text: string
    let sourceRef: AddEvidenceInput['sourceRef']
    let id: string
    if (request.text !== undefined) {
      if (request.text.length > this.config.maxChars) throw new SourceError('TOO_LARGE', `export is ${request.text.length} characters, the cap is ${this.config.maxChars}`)
      text = request.text
      sourceRef = { kind: 'other', id: 'inline:cnki-export', retrievedAt: this.iso() }
      id = 'inline:cnki-export'
    } else {
      const file = await this.resolveFile(request.path!)
      if (/\.(docx?|pdf)$/iu.test(file.id)) throw new SourceError('UNSUPPORTED_FILE', 'docx/pdf is not parsed here; export RIS or labeled text (.txt/.ris/.md)')
      text = await readFile(file.absolute, 'utf8')
      if (text.length > this.config.maxChars) throw new SourceError('TOO_LARGE', `export is ${text.length} characters, the cap is ${this.config.maxChars}`)
      sourceRef = { kind: 'file', id: file.id, retrievedAt: this.iso() }
      id = file.id
    }
    let records: BibRecord[]
    try {
      records = importRecords(text, format)
    } catch (error) {
      if (error instanceof ImportError) throw new SourceError(error.code === 'NO_RECORDS' ? 'NO_RECORDS' : 'INVALID_INPUT', error.message)
      throw error
    }
    const validation = validateRecords(records)
    const persist = request.persist ?? this.config.persist
    if (!persist) return { records, validation }
    const checks: CheckResult[] = [
      {
        checkId: 'chk-import-count',
        check: 'other',
        status: 'pass',
        severity: 'info',
        detail: `imported ${records.length} record(s)`,
      },
      ...validation.issues
        .filter(issue => issue.severity !== 'info')
        .map((issue, index) => ({
          checkId: `chk-record-${index + 1}`,
          check: 'other' as const,
          status: issue.severity === 'error' ? ('fail' as const) : ('warn' as const),
          severity: issue.severity === 'error' ? ('error' as const) : ('warning' as const),
          detail: `${issue.recordId}: ${issue.code} — ${issue.detail}`,
        })),
    ]
    const port = this.port()
    try {
      const captured = await port.capture({ bytes: text, mediaType: 'text/plain', sourceRef, capturedAt: this.iso() })
      const evidence = (
        await port.addEvidence({
          evidenceId: stableId('ev', ['source-cnki', id, captured.snapshot.snapshotId]),
          title: `CNKI export (${records.length} records)`,
          sourceRef,
          snapshotIds: [captured.snapshot.snapshotId],
          anchors: [{ snapshotId: captured.snapshot.snapshotId, kind: 'record', value: 'field:recordId' }],
          provenance: { plugin: 'dsh-source-cnki', version: VERSION, method: 'export-import', retrievedAt: this.iso() },
          checks,
          notes: validation.ok ? 'structural validation passed' : 'structural validation found errors',
        })
      ).evidence
      const record = await port.buildRecord({ evidenceIds: [evidence.evidenceId] })
      if (!validateRep(record).ok) throw new SourceError('STORE_ERROR', 'refusing to write an invalid REP record')
      const directory = path.join(this.config.root, 'records')
      await mkdir(directory, { recursive: true })
      const file = path.join(directory, `${evidence.evidenceId}.rep.json`)
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      return { records, validation, evidenceId: evidence.evidenceId, recordPath: file }
    } catch (error) {
      if (error instanceof SourceError) throw error
      if (error instanceof RepStoreError) throw new SourceError('STORE_ERROR', error.message)
      throw new SourceError('STORE_ERROR', `could not store the evidence: ${(error as Error).message}`)
    }
  }

  /**
   * Format citations.
   * @param records - records to cite.
   * @param options - style and starting number.
   * @returns the formatted citations.
   */
  cite(records: readonly BibRecord[], options: CiteOptions = {}): string[] {
    const safeRecords = assertRecords(records)
    const style = options.style ?? this.config.style
    if (style !== 'gbt7714' && style !== 'gbt7714-numeric' && style !== 'apa') throw new SourceError('INVALID_INPUT', 'style must be gbt7714, gbt7714-numeric or apa')
    if (options.startIndex !== undefined && (!Number.isSafeInteger(options.startIndex) || options.startIndex < 1)) {
      throw new SourceError('INVALID_INPUT', 'startIndex must be a positive integer')
    }
    return formatBibliography(safeRecords, { ...options, style })
  }

  /**
   * Validate records.
   * @param records - records to check.
   * @returns the validation result.
   */
  check(records: readonly BibRecord[]): ValidationResult {
    return validateRecords(assertRecords(records))
  }
}
