/**
 * Importing Chinese-literature records from exported files.
 *
 * Scope decision, stated up front: CNKI has no public API for this purpose, and
 * the plugin **does not log in and does not scrape**. It reads what the user
 * exported — RIS/EndNote-style tagged text or a labeled (`题名：…`) text file —
 * and turns it into structured records. Anything the export does not contain is
 * reported as missing, never inferred.
 *
 * @module dsh-source-cnki/formats
 */

/** One bibliographic record. */
export interface BibRecord {
  readonly recordId: string
  readonly type: 'journal' | 'thesis' | 'conference' | 'book' | 'other'
  readonly title: string
  readonly authors: readonly string[]
  readonly journal?: string
  readonly year?: number
  readonly volume?: string
  readonly issue?: string
  readonly pages?: string
  readonly doi?: string
  readonly keywords?: readonly string[]
  readonly abstract?: string
  readonly language: 'zh' | 'en' | 'unknown'
}

/** Parse failure codes. */
export type ImportErrorCode = 'EMPTY' | 'NO_RECORDS' | 'UNKNOWN_FORMAT'

/** A typed import failure. */
export class ImportError extends Error {
  /** Stable code. */
  readonly code: ImportErrorCode

  constructor(code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}

/** Stable record id from a DOI, or from title+year. */
export function recordIdOf(input: { doi?: string; title: string; year?: number }): string {
  const base = input.doi !== undefined ? `doi:${input.doi.toLowerCase()}` : `t:${input.title.toLowerCase()}:${input.year ?? ''}`
  let hash = 2166136261
  for (const character of base) {
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return `cnki-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** Chinese text detection. */
function languageOf(text: string): BibRecord['language'] {
  if (/[\u3400-\u9fff]/u.test(text)) return 'zh'
  if (/[a-zA-Z]/u.test(text)) return 'en'
  return 'unknown'
}

/** Field aliases for the labeled format and for RIS tags. */
const ALIASES: Record<string, keyof Omit<BibRecord, 'recordId' | 'language'>> = {
  // Chinese labels
  题名: 'title', 标题: 'title', 题目: 'title', 篇名: 'title',
  作者: 'authors', 责任者: 'authors', 第一作者: 'authors',
  来源: 'journal', 刊名: 'journal', 期刊: 'journal', 文献来源: 'journal', 报纸: 'journal',
  年: 'year', 年份: 'year', 出版年: 'year', 发表时间: 'year',
  卷: 'volume', 期: 'issue', 页码: 'pages', 页: 'pages',
  DOI: 'doi', doi: 'doi',
  关键词: 'keywords', 关键字: 'keywords',
  摘要: 'abstract', 文摘: 'abstract',
  类型: 'type', 文献类型: 'type', 数据库: 'type',
  // RIS tags
  TI: 'title', T1: 'title', TY: 'type', AU: 'authors', A1: 'authors',
  JO: 'journal', JF: 'journal', T2: 'journal', JA: 'journal',
  PY: 'year', Y1: 'year', DA: 'year',
  VL: 'volume', IS: 'issue', SP: 'pages', EP: 'pages',
  DO: 'doi', KW: 'keywords', AB: 'abstract', N2: 'abstract',
}

/** Map a type string to the record type. */
function typeOf(raw: string): BibRecord['type'] {
  const value = raw.toUpperCase()
  if (value.includes('JOUR') || value.includes('期刊')) return 'journal'
  if (value.includes('THES') || value.includes('学位') || value.includes('硕士') || value.includes('博士')) return 'thesis'
  if (value.includes('CONF') || value.includes('会议')) return 'conference'
  if (value.includes('BOOK') || value.includes('图书') || value.includes('专著')) return 'book'
  return 'other'
}

/** Clean a value. */
function clean(value: string): string {
  return value.trim().replace(/^[：:]\s*/u, '').replace(/\s+/gu, ' ')
}

/** Split authors on common delimiters. */
function authorsOf(value: string): string[] {
  return clean(value)
    .split(/\s*[;；,，]\s*/u)
    .map(name => name.trim())
    .filter(name => name !== '')
}

/** Normalize one raw field map into a record. */
function toRecord(fields: Map<string, string[]>): BibRecord | undefined {
  const title = (fields.get('title') ?? []).join(' ').trim()
  if (title === '') return undefined
  const typeRaw = (fields.get('type') ?? []).join(' ')
  const rawAuthors = fields.get('authors') ?? []
  const yearRaw = (fields.get('year') ?? [])[0] ?? ''
  const yearMatch = /\d{4}/u.exec(yearRaw)
  const pagesRaw = (fields.get('pages') ?? []).join('-')
  const doiRaw = (fields.get('doi') ?? [])[0]?.trim()
  const keywords = (fields.get('keywords') ?? []).flatMap(value => value.split(/\s*[;；,，]\s*/u)).filter(Boolean)
  const abstract = (fields.get('abstract') ?? []).join(' ').trim()
  return {
    recordId: recordIdOf({ title, ...(yearMatch === null ? {} : { year: Number(yearMatch[0]) }), ...(doiRaw === undefined || doiRaw === '' ? {} : { doi: doiRaw }) }),
    type: typeOf(typeRaw),
    title,
    authors: rawAuthors.flatMap(authorsOf),
    ...((fields.get('journal') ?? []).join(' ').trim() === '' ? {} : { journal: (fields.get('journal') ?? []).join(' ').trim() }),
    ...(yearMatch === null ? {} : { year: Number(yearMatch[0]) }),
    ...((fields.get('volume') ?? []).join('') === '' ? {} : { volume: (fields.get('volume') ?? []).join('') }),
    ...((fields.get('issue') ?? []).join('') === '' ? {} : { issue: (fields.get('issue') ?? []).join('') }),
    ...(pagesRaw === '' ? {} : { pages: pagesRaw.replace(/\s+/gu, '') }),
    ...(doiRaw === undefined || doiRaw === '' ? {} : { doi: doiRaw }),
    ...(keywords.length === 0 ? {} : { keywords }),
    ...(abstract === '' ? {} : { abstract }),
    language: languageOf(title),
  }
}

/**
 * Parse an RIS/EndNote-style export (`TY  - JOUR` … `ER  -`).
 * @param text - the export.
 * @returns records (empty when the format does not match).
 */
export function parseRis(text: string): BibRecord[] {
  const records: BibRecord[] = []
  let fields = new Map<string, string[]>()
  let inRecord = false
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/u.exec(line)
    if (match === null) {
      if (inRecord && line.trim() !== '' && fields.size > 0) {
        const lastKey = [...fields.keys()].at(-1)!
        const values = fields.get(lastKey)!
        values[values.length - 1] = `${values.at(-1)!} ${line.trim()}`
      }
      continue
    }
    const tag = match[1]!
    const value = match[2] ?? ''
    if (tag === 'TY') {
      inRecord = true
      fields = new Map()
      fields.set('type', [value])
      continue
    }
    if (tag === 'ER') {
      const record = toRecord(fields)
      if (record !== undefined) records.push(record)
      inRecord = false
      fields = new Map()
      continue
    }
    const key = ALIASES[tag]
    if (key === undefined || key === 'type') {
      if (key === 'type') {
        const list = fields.get('type') ?? []
        list.push(value)
        fields.set('type', list)
      }
      continue
    }
    const list = fields.get(key) ?? []
    list.push(value)
    fields.set(key, list)
  }
  return records
}

/**
 * Parse a labeled text export (`题名：…`, `作者：…`, blank line between records).
 * @param text - the export.
 * @returns records (empty when the format does not match).
 */
export function parseLabeled(text: string): BibRecord[] {
  const records: BibRecord[] = []
  for (const block of text.split(/\n\s*\n/u)) {
    const fields = new Map<string, string[]>()
    for (const line of block.split('\n')) {
      const match = /^\s*([^：:]{1,12})\s*[：:]\s*(.+)$/u.exec(line)
      if (match === null) {
        // Continuation line of the previous field.
        if (fields.size > 0) {
          const lastKey = [...fields.keys()].at(-1)!
          const values = fields.get(lastKey)!
          values[values.length - 1] = `${values.at(-1)!} ${line.trim()}`
        }
        continue
      }
      const key = ALIASES[match[1]!.trim()]
      if (key === undefined) continue
      const list = fields.get(key) ?? []
      list.push(match[2]!.trim())
      fields.set(key, list)
      if (key === 'type') fields.set('type', [match[2]!.trim()])
    }
    const record = toRecord(fields)
    if (record !== undefined) records.push(record)
  }
  return records
}

/**
 * Import records with format detection.
 * @param text - the export text.
 * @param format - `auto`, `ris` or `labeled`.
 * @returns the parsed records.
 */
export function importRecords(text: string, format: 'auto' | 'ris' | 'labeled' = 'auto'): BibRecord[] {
  if (typeof text !== 'string' || text.trim() === '') throw new ImportError('EMPTY', 'the export is empty')
  const ris = format === 'labeled' ? [] : parseRis(text)
  const labeled = format === 'ris' ? [] : parseLabeled(text)
  const records = ris.length >= labeled.length ? ris : labeled
  if (records.length === 0) throw new ImportError('NO_RECORDS', 'no records were recognized; export as RIS or as labeled text (题名：/作者：/来源：)')
  return records
}
