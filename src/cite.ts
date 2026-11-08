/**
 * Citation formatting: GB/T 7714-2015 (顺序编码制) and APA 7th.
 *
 * Only fields present in the record are emitted — nothing is invented (no
 * publisher, place or page range is guessed). The README lists the mapping and
 * the simplifications.
 *
 * @module dsh-source-cnki/cite
 */

import type { BibRecord } from './formats.ts'

/** Citation styles. */
export type CiteStyle = 'gbt7714' | 'gbt7714-numeric' | 'apa'

/** Formatting options. */
export interface CiteOptions {
  readonly style?: CiteStyle
  /** First number for the numeric style (default 1). */
  readonly startIndex?: number
}

/** True for a mostly-ASCII name (treated as Western). */
function isWestern(name: string): boolean {
  return /^[\x20-\x7E.]+$/u.test(name) && /[A-Za-z]/u.test(name)
}

/** Convert "John Smith" to "SMITH J" (GB/T style), otherwise keep. */
function gbtAuthor(name: string): string {
  const trimmed = name.trim()
  if (!isWestern(trimmed)) return trimmed
  const parts = trimmed.split(/\s+/u).filter(Boolean)
  if (parts.length === 1) return parts[0]!.toUpperCase()
  const surname = parts.at(-1)!
  const initials = parts.slice(0, -1).map(part => part[0]!.toUpperCase()).join(' ')
  return `${surname.toUpperCase()} ${initials}`
}

/** Author list for GB/T: ≤3 all, else first 3 + 等 / et al. */
function gbtAuthors(record: BibRecord): string {
  const names = record.authors.map(gbtAuthor)
  if (names.length === 0) return '[佚名]'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')}, ${record.language === 'zh' ? '等' : 'et al'}`
}

/** Author list for APA: "Surname, I. I., & Surname, I. I.". */
function apaAuthors(record: BibRecord): string {
  if (record.authors.length === 0) return 'Anonymous'
  const formatted = record.authors.map(name => {
    const trimmed = name.trim()
    if (!isWestern(trimmed)) return trimmed
    const parts = trimmed.split(/\s+/u).filter(Boolean)
    const surname = parts.at(-1)!
    const initials = parts.slice(0, -1).map(part => `${part[0]!.toUpperCase()}.`).join(' ')
    return `${surname}, ${initials}`
  })
  if (formatted.length === 1) return formatted[0]!
  if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`
  return `${formatted.slice(0, -1).join(', ')}, & ${formatted.at(-1)!}`
}

/** Page range with an en dash. */
function pagesOf(record: BibRecord): string | undefined {
  if (record.pages === undefined) return undefined
  return record.pages.replace(/-/gu, '–')
}

/** GB/T 7714 type marker. */
function gbtType(record: BibRecord): string {
  return record.type === 'journal' ? 'J' : record.type === 'thesis' ? 'D' : record.type === 'conference' ? 'C' : record.type === 'book' ? 'M' : 'Z'
}

/**
 * Format one citation.
 * @param record - the record.
 * @param options - style and starting number.
 * @returns the formatted citation.
 */
export function formatCitation(record: BibRecord, options: CiteOptions = {}): string {
  const style = options.style ?? 'gbt7714-numeric'
  if (style === 'apa') {
    const year = record.year === undefined ? 'n.d.' : String(record.year)
    const source = record.journal === undefined ? '' : `*${record.journal}*`
    const volume = record.volume === undefined ? '' : record.volume
    const issue = record.issue === undefined ? '' : `(${record.issue})`
    const pages = pagesOf(record) === undefined ? '' : `, ${pagesOf(record)}`
    const doi = record.doi === undefined ? '' : ` https://doi.org/${record.doi}`
    const tail = source === '' ? '' : `, ${volume}${issue}${pages}.`
    return `${apaAuthors(record)} (${year}). ${record.title}.${tail === '' ? '' : ` ${source}${tail}`}${doi}`.replace(/\s+/gu, ' ').trim()
  }
  const authors = gbtAuthors(record)
  const year = record.year === undefined ? '[出版年不详]' : String(record.year)
  let source: string
  if (record.type === 'thesis') {
    source = `${record.journal ?? '[学校不详]'}, ${year}`
  } else if (record.type === 'conference') {
    source = `${record.journal ?? '[会议名称不详]'}, ${year}`
  } else if (record.type === 'book') {
    source = `${record.journal ?? '[出版者不详]'}, ${year}`
  } else {
    const volumePart = record.volume === undefined ? '' : `, ${record.volume}`
    const issuePart = record.issue === undefined ? '' : `(${record.issue})`
    const pagesPart = record.pages === undefined ? '' : `: ${pagesOf(record)}`
    const journal = record.journal ?? '[刊名不详]'
    // GB/T order: 刊名, 年, 卷(期): 页码.
    source = `${journal}, ${year}${volumePart}${issuePart}${pagesPart}`
  }
  const doi = record.doi === undefined ? '' : ` DOI: ${record.doi}.`
  const base = `${authors}. ${record.title}[${gbtType(record)}]. ${source}.${doi}`
  const index = options.startIndex ?? 1
  return style === 'gbt7714-numeric' ? `[${index}] ${base}` : base
}

/**
 * Format a bibliography.
 * @param records - the records, in citation order.
 * @param options - style and starting number.
 * @returns one formatted string per record.
 */
export function formatBibliography(records: readonly BibRecord[], options: CiteOptions = {}): string[] {
  const start = options.startIndex ?? 1
  return records.map((record, index) => formatCitation(record, { ...options, startIndex: start + index }))
}
