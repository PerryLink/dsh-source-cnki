/**
 * Export parsing, citation formatting and structural validation.
 * @module test/formats-cite.spec
 */

import { describe, expect, it } from 'vitest'
import { formatBibliography, formatCitation } from '../src/cite.ts'
import { importRecords, ImportError, parseLabeled, parseRis } from '../src/formats.ts'
import { validateRecords } from '../src/validate.ts'

const RIS = `TY  - JOUR
AU  - 张三
AU  - 李四
TI  - 测试论文：一个合成示例
JO  - 中国科学
PY  - 2021
VL  - 42
IS  - 3
SP  - 15
EP  - 20
DO  - 10.1234/synth.2021.001
KW  - 合成数据; 测试
AB  - 这是一段合成摘要。
ER  -

TY  - JOUR
AU  - John Smith
AU  - Jane Doe
TI  - A synthetic English paper
JO  - Journal of Tests
PY  - 2020
VL  - 7
IS  - 2
SP  - 100
EP  - 110
DO  - 10.1234/synth.2020.002
ER  -
`

const LABELED = `题名：中文文献的合成记录
作者：王五；赵六
来源：情报学报
年：2019
期：4
页码：33-40
DOI：10.5678/synth.2019.004

题名：另一条记录
作者：钱七
来源：图书馆论坛
年：2018
卷：38
期：1
页码：1-9
`

describe('import', () => {
  it('parses RIS records', () => {
    const records = parseRis(RIS)
    expect(records).toHaveLength(2)
    expect(records[0]!.title).toContain('测试论文')
    expect(records[0]!.authors).toEqual(['张三', '李四'])
    expect(records[0]!.journal).toBe('中国科学')
    expect(records[0]!.year).toBe(2021)
    expect(records[0]!.pages).toBe('15-20')
    expect(records[0]!.language).toBe('zh')
    expect(records[1]!.language).toBe('en')
    expect(records[0]!.recordId).toMatch(/^cnki-[0-9a-f]{8}$/u)
  })

  it('parses labeled text records', () => {
    const records = parseLabeled(LABELED)
    expect(records).toHaveLength(2)
    expect(records[0]!.journal).toBe('情报学报')
    expect(records[1]!.volume).toBe('38')
  })

  it('auto-detects and rejects empty or unrecognized exports', () => {
    expect(importRecords(RIS)).toHaveLength(2)
    expect(importRecords(LABELED)).toHaveLength(2)
    expect(() => importRecords('   ')).toThrow(ImportError)
    expect(() => importRecords('just a sentence with no fields')).toThrow(/no records/u)
  })

  it('parses CRLF exports and strips a leading UTF-8 BOM', () => {
    const ris = `\uFEFF${RIS.replace(/\n/gu, '\r\n')}`
    const fromRis = parseRis(ris)
    expect(fromRis).toHaveLength(2)
    expect(fromRis[0]!.title).toContain('测试论文')
    const labeled = `\uFEFF${LABELED.replace(/\n/gu, '\r\n')}`
    const fromLabeled = parseLabeled(labeled)
    expect(fromLabeled).toHaveLength(2)
    expect(fromLabeled[0]!.journal).toBe('情报学报')
    expect(importRecords(ris)).toHaveLength(2)
  })
})

describe('GB/T 7714', () => {
  const record = parseRis(RIS)[0]!

  it('formats a numbered journal citation with an en dash page range', () => {
    expect(formatCitation(record)).toBe('[1] 张三, 李四. 测试论文：一个合成示例[J]. 中国科学, 2021, 42(3): 15–20. DOI: 10.1234/synth.2021.001.')
  })

  it('uses 等 after three Chinese authors and et al for English', () => {
    const many = parseRis(RIS)[0]!
    const chinese = formatCitation({ ...many, authors: ['张三', '李四', '王五', '赵六'] })
    expect(chinese).toContain('张三, 李四, 王五, 等.')
    const english = formatCitation({ ...many, authors: ['John Smith', 'Jane Doe', 'Bob Lee', 'Ann Wu'], language: 'en', title: 'A paper' })
    expect(english).toContain('SMITH J, DOE J, LEE B, et al.')
  })

  it('marks a missing journal instead of inventing one', () => {
    const { journal: _journal, ...withoutJournal } = record
    const citation = formatCitation(withoutJournal)
    expect(citation).toContain('[刊名不详]')
  })

  it('formats a thesis with the school field', () => {
    const citation = formatCitation({ ...record, type: 'thesis', journal: '某大学' })
    expect(citation).toContain('[D]. 某大学, 2021.')
  })

  it('numbers sequentially', () => {
    const citations = formatBibliography(parseRis(RIS))
    expect(citations[0]!.startsWith('[1] ')).toBe(true)
    expect(citations[1]!.startsWith('[2] ')).toBe(true)
  })
})

describe('APA', () => {
  it('formats Western authors, year, journal, volume and DOI', () => {
    const record = parseRis(RIS)[1]!
    const citation = formatCitation(record, { style: 'apa' })
    expect(citation).toContain('Smith, J., & Doe, J. (2020).')
    expect(citation).toContain('*Journal of Tests*')
    expect(citation).toContain('7(2), 100–110')
    expect(citation).toContain('https://doi.org/')
  })
})

describe('validation', () => {
  it('reports structural problems without judging the content', () => {
    const records = parseRis(RIS)
    const { journal: _journal, ...withoutJournal } = records[0]!
    const result = validateRecords([
      ...records,
      { ...withoutJournal, recordId: 'cnki-00000000', title: '', year: 1800, doi: 'not-a-doi', pages: 'abc' },
    ])
    const codes = result.issues.map(issue => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['missing_title', 'missing_journal', 'implausible_year', 'malformed_doi', 'odd_pages']))
    expect(result.ok).toBe(false)
  })

  it('flags duplicates', () => {
    const record = parseRis(RIS)[0]!
    const result = validateRecords([record, record])
    expect(result.issues.some(issue => issue.code === 'duplicate')).toBe(true)
  })

  it('rejects a far-future year instead of accepting anything below a fixed 2100', () => {
    const record = parseRis(RIS)[0]!
    const result = validateRecords([{ ...record, year: new Date().getUTCFullYear() + 2 }])
    expect(result.issues.some(issue => issue.code === 'implausible_year')).toBe(true)
  })
})
