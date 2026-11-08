/**
 * Metadata completeness checks for imported records.
 *
 * These are structural checks (missing fields, impossible dates, malformed DOI,
 * duplicates), not a judgement about whether the record is the right paper.
 *
 * @module dsh-source-cnki/validate
 */

import type { BibRecord } from './formats.ts'

/** One issue. */
export interface RecordIssue {
  readonly recordId: string
  readonly code: string
  readonly severity: 'info' | 'warning' | 'error'
  readonly detail: string
}

/** Validation result. */
export interface ValidationResult {
  readonly records: number
  readonly issues: readonly RecordIssue[]
  readonly ok: boolean
}

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/u

/**
 * Validate imported records.
 * @param records - the records.
 * @returns issues and whether any error-level issue exists.
 */
export function validateRecords(records: readonly BibRecord[]): ValidationResult {
  const issues: RecordIssue[] = []
  const seen = new Map<string, number>()
  const currentYear = 2100
  for (const record of records) {
    const count = (seen.get(record.recordId) ?? 0) + 1
    seen.set(record.recordId, count)
    if (count > 1) issues.push({ recordId: record.recordId, code: 'duplicate', severity: 'warning', detail: `the same record appears ${count} times` })
    if (record.title.trim() === '') issues.push({ recordId: record.recordId, code: 'missing_title', severity: 'error', detail: 'the title is empty' })
    if (record.authors.length === 0) issues.push({ recordId: record.recordId, code: 'missing_authors', severity: 'warning', detail: 'no author was imported' })
    if (record.type === 'journal' && record.journal === undefined) {
      issues.push({ recordId: record.recordId, code: 'missing_journal', severity: 'error', detail: 'a journal article has no journal name' })
    }
    if (record.year === undefined) {
      issues.push({ recordId: record.recordId, code: 'missing_year', severity: 'warning', detail: 'no publication year' })
    } else if (!Number.isInteger(record.year) || record.year < 1900 || record.year > currentYear) {
      issues.push({ recordId: record.recordId, code: 'implausible_year', severity: 'error', detail: `year ${record.year} is outside 1900–${currentYear}` })
    }
    if (record.pages !== undefined && !/^\d+([–-]\d+)?$/u.test(record.pages)) {
      issues.push({ recordId: record.recordId, code: 'odd_pages', severity: 'warning', detail: `page range "${record.pages}" is not numeric` })
    }
    if (record.doi !== undefined && !DOI_PATTERN.test(record.doi)) {
      issues.push({ recordId: record.recordId, code: 'malformed_doi', severity: 'warning', detail: `DOI "${record.doi}" does not look like 10.xxxx/…` })
    }
    if (record.type === 'journal' && record.volume === undefined && record.issue === undefined) {
      issues.push({ recordId: record.recordId, code: 'missing_volume_issue', severity: 'info', detail: 'neither volume nor issue was imported' })
    }
  }
  return { records: records.length, issues, ok: !issues.some(issue => issue.severity === 'error') }
}
