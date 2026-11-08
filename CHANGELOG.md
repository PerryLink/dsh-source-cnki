# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

First release: Chinese-literature export import and citation formatting.

### Added

- `cnki_import`: RIS/EndNote-style and labeled (`题名：`) export parsing,
  stable record ids (DOI-based when available), language detection, and
  structural validation; the export becomes REP evidence when persisted.
- `cnki_cite`: GB/T 7714-2015 顺序编码制 (with or without `[n]`) and APA 7,
  including the ≤3 / >3 author rules and `等` / `et al` handling.
- `cnki_check`: structural issues (missing fields, implausible year, malformed
  DOI, odd pages, duplicates).
- 18 tests.

### Notes

- **No CNKI access of any kind**: no login, no scraping, no CNKI API. The user
  exports; the plugin parses. This is a deliberate scope and licensing decision,
  not a missing feature.
- Missing fields are reported, never invented.
- GB/T 著者-出版年制 and `[J/OL]`/`[EB/OL]` carriers are out of scope in v0.1.
