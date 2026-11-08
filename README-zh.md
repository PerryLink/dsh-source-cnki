# dsh-source-cnki

**中文文献：导入你自己的导出文件、按 GB/T 7714 格式化、检查元数据——不爬 CNKI。**

*不登录、不爬站、不调 CNKI API（该用途下没有公开 API）。插件读取 RIS/EndNote 风格或字段式文本导出，分配稳定记录 id，按 GB/T 7714-2015（顺序编码制）或 APA 7 格式化，并做结构化校验。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 范围决定（先读）

CNKI has no public API for this purpose. This plugin therefore **does not** log in, scrape, or bypass any access control. You export the records yourself (RIS/EndNote-style tagged text, or labeled text with `题名：`/`作者：`/`来源：`), and the plugin works on that export. If your export lacks a field, the plugin says "missing" — it never invents a journal, year, volume, page range or DOI.

## 它做什么

- **`cnki_import`** — parses RIS/EndNote-style and labeled text exports, assigns a stable `recordId` (DOI-based when present, otherwise title+year), detects language, and validates structure. The export becomes REP evidence when `persist` is on.
- **`cnki_cite`** — GB/T 7714-2015 顺序编码制 (`[1] 作者. 题名[J]. 刊名, 年, 卷(期): 页码.`), the same without numbering, or APA 7. Author rules: GB/T ≤3 all, otherwise first 3 + `等`/`et al`; Western names become `SURNAME I`; APA becomes `Surname, I.`.
- **`cnki_check`** — structural validation: missing title/journal/year/authors, implausible year, malformed DOI, non-numeric pages, duplicates, journal without volume or issue.

## 它不做什么

- **No CNKI access.** No login, no cookies, no scraping, no unofficial endpoints.
- **No content verification.** It does not check that the record matches the real paper; use `dsh-cite-verify` for DOIs.
- **No semantic fields.** No cited-by counts, impact factors or fund numbers.
- **No DOCX/PDF.** Export as RIS/labeled text (PDF text extraction: `dsh-doc-anchor`).
- **No claim of GB/T completeness.** Variants exist (著者-出版年制, [EB/OL] carriers, [J/OL] with URLs); v0.1 implements the common journal/thesis/conference/book cases and says so.

## 支持的格式

| Format | Recognized |
|---|---|
| RIS/EndNote | `TY`, `AU`, `TI`, `JO`, `PY`, `VL`, `IS`, `SP`, `EP`, `DO`, `KW`, `AB`, `ER` (first tag wins per field, authors accumulate) |
| Labeled text | `题名`/`标题`/`篇名`, `作者`, `来源`/`刊名`, `年`/`发表时间`, `卷`, `期`, `页码`, `DOI`, `关键词`, `摘要`, `类型`; blank line separates records |

Unknown tags are ignored, not guessed.

## 工具

### `cnki_import`

`{ text? | path?, format?, persist? }` → `{ ok, records, validation, evidenceId?, recordPath? }`.

### `cnki_cite`

`{ records, style?, startIndex? }` → `{ ok, citations, text }`.

### `cnki_check`

`{ records }` → `{ ok, validation }`.

### Error codes

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `UNSUPPORTED_FILE` · `NO_RECORDS` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`** (verified 2026-11-08); peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0` (tested `24.22.1`), ESM only |
| Peers | `@perrylink/dsh-research-core ^0.1.0`, `@deepseek-ai/cordis ^4.0.5-alpha.1`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| Runtime dependencies | **zero** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-source-cnki
dsh --profile <name> --dump-config | grep dsh-source-cnki
```

## 配置

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` mounts nothing |
| `root` | `.source-cnki` | store/record root |
| `workspaceRoot` | `process.cwd()` | paths must resolve inside it |
| `maxChars` | `2000000` | export cap (fails, never truncates) |
| `persist` | `true` | store the export as REP evidence + record |
| `style` | `gbt7714-numeric` | default citation style |

## 安全边界

- No network at all: no CNKI, no DOI resolution, no telemetry.
- Read-only on the export; writes only under `root`.
- `realpath` containment; DOCX/PDF rejected with a conversion hint.
- The export is data. Instruction-like text inside a title or abstract is never executed (there is no executor).

## 评测

**23 tests**: RIS and labeled parsing (Chinese and English records, CRLF/BOM exports, DOI-based ids, language detection), auto-detection and empty/unrecognized rejection, GB/T journal citation with en-dash pages, ≤3 vs >3 author rules (等 / et al), missing-journal marker, thesis marker, sequential numbering, APA author/year/journal/volume/DOI, validation codes (missing title/journal, implausible year including far-future dates, malformed DOI, odd pages, duplicates), runtime (valid REP record, cite/check, traversal/symlink/DOCX/oversize rejection, malformed records and `null` text rejected), tool schemas, import→cite→check end to end, failure branches, plugin contract, package contract.

No benchmark is claimed: the ground truth is your export; correctness of the formatter is checked against the GB/T rules above with fixtures.

## 已知限制（v0.1）

- GB/T 7714 著者-出版年制, `[J/OL]`/`[EB/OL]` carriers and English journal abbreviation rules are not implemented.
- Conference and book records reuse the `journal` field for proceedings/publisher (the export formats rarely carry separate fields).
- Parsing is line-oriented; deeply wrapped multi-line abstracts in labeled exports may merge into the previous field.
- No CNKI record id (`CNKI:`/`DBID`) retention beyond what the export contains.

## 许可

Apache-2.0. No third-party runtime code.
