# dsh-source-cnki

**中文文献记录：导入你自己的导出文件，按 GB/T 7714 引用，检查元数据——全程不抓取 CNKI。**

*不登录、不抓取、不调用 CNKI API（该用途没有公开 API）。插件读取 RIS/EndNote 风格或带标签的文本导出，分配稳定的记录 id，按 GB/T 7714-2015（顺序编码制）或 APA 7 排版，并做结构校验。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 范围说明（请先阅读）

CNKI 没有面向此用途的公开 API。因此本插件**不会**登录、抓取或绕过任何访问控制。记录由你自行导出（RIS/EndNote 风格标签文本，或带 `题名：`/`作者：`/`来源：` 的标签文本），插件只在这份导出上工作。如果导出缺少某个字段，插件会明确说“缺失”，绝不会凭空编造期刊、年份、卷、页码或 DOI。

## 它做什么

- **`cnki_import`** — 解析 RIS/EndNote 风格和带标签的文本导出，分配稳定的 `recordId`（有 DOI 时基于 DOI，否则基于标题+年份），识别语言并校验结构。开启 `persist` 时，导出会成为 REP 证据。
- **`cnki_cite`** — 支持 GB/T 7714-2015 顺序编码制（`[1] 作者. 题名[J]. 刊名, 年, 卷(期): 页码.`）、同样格式但不带编号，或 APA 7。作者规则：GB/T 在作者不超过 3 位时全部列出，否则列前 3 位 + `等`/`et al`；西文姓名转为 `SURNAME I`；APA 转为 `Surname, I.`。
- **`cnki_check`** — 结构校验：缺少标题/期刊/年份/作者、年份不合理、DOI 格式错误、页码非数字、重复记录，以及有期刊但没有卷或期。

## 它不做什么

- **不访问 CNKI。** 不登录、不使用 cookie、不抓取、不调用非官方端点。
- **不核实内容。** 不检查记录与真实论文是否一致；DOI 核验请用 `dsh-cite-verify`。
- **不提供语义字段。** 没有被引次数、影响因子或基金编号。
- **不处理 DOCX/PDF。** 请导出为 RIS/带标签文本（PDF 文本提取用 `dsh-doc-anchor`）。
- **不宣称覆盖 GB/T 的全部情形。** 该标准存在变体（著者-出版年制、[EB/OL] 载体、带 URL 的 [J/OL]）；v0.1 实现常见的期刊/学位论文/会议/图书情形，并如实说明这一点。

## 格式

| 格式 | 可识别内容 |
|---|---|
| RIS/EndNote | `TY`、`AU`、`TI`、`JO`、`PY`、`VL`、`IS`、`SP`、`EP`、`DO`、`KW`、`AB`、`ER`（每个字段以第一个标签为准，作者累加） |
| 带标签文本 | `题名`/`标题`/`篇名`、`作者`、`来源`/`刊名`、`年`/`发表时间`、`卷`、`期`、`页码`、`DOI`、`关键词`、`摘要`、`类型`；空行分隔记录 |

未知标签会被忽略，不做猜测。

## 工具

### `cnki_import`

`{ text? | path?, format?, persist? }` → `{ ok, records, validation, evidenceId?, recordPath? }`.

### `cnki_cite`

`{ records, style?, startIndex? }` → `{ ok, citations, text }`.

### `cnki_check`

`{ records }` → `{ ok, validation }`.

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `UNSUPPORTED_FILE` · `NO_RECORDS` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`**（2026-11-08 实测）；peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0`（实测 `24.22.1`），仅 ESM |
| Peer 依赖 | `@perrylink/dsh-research-core ^0.1.0`、`@deepseek-ai/cordis ^4.0.5-alpha.1`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| 运行时依赖 | **零** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-source-cnki
dsh --profile <name> --dump-config | grep dsh-source-cnki
```

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不挂载任何内容 |
| `root` | `.source-cnki` | 存储/记录根目录 |
| `workspaceRoot` | `process.cwd()` | 路径必须解析到该目录内 |
| `maxChars` | `2000000` | 导出文件上限（超限即失败，绝不截断） |
| `persist` | `true` | 把导出存为 REP 证据 + 记录 |
| `style` | `gbt7714-numeric` | 默认引用格式 |

## 安全边界

- 完全无网络：不访问 CNKI，不做 DOI 解析，不上报遥测。
- 对导出文件只读；只在 `root` 下写入。
- `realpath` 包含性校验；DOCX/PDF 会被拒绝并给出转换提示。
- 导出文件视为数据。标题或摘要中的指令性文本永远不会被执行（没有执行器）。

## 评测

**23 个测试**：RIS 与带标签解析（中英文记录、CRLF/BOM 导出、基于 DOI 的 id、语言识别）、自动格式识别与空内容/无法识别内容的拒绝、GB/T 期刊引用（页码使用 en dash 连接）、≤3 位与 >3 位作者规则（等 / et al）、缺期刊标记、学位论文标记、顺序编号、APA 的作者/年份/期刊/卷/DOI、校验代码（缺标题/期刊、不合理年份（含极远未来日期）、DOI 格式错误、页码异常、重复）、运行时（有效 REP 记录、cite/check、路径穿越/符号链接/DOCX/超大文件拒绝、畸形记录与 `null` 文本拒绝）、工具 schema、import→cite→check 端到端、失败分支、插件契约、包契约。

不宣称任何基准成绩：基准真值就是你的导出文件；格式化器的正确性按上面的 GB/T 规则用 fixture 校验。

## 已知限制（v0.1）

- 未实现 GB/T 7714 著者-出版年制、`[J/OL]`/`[EB/OL]` 载体以及英文期刊缩写规则。
- 会议与图书记录复用 `journal` 字段存放会议录/出版社信息（导出格式通常没有独立字段）。
- 解析按行进行；带标签导出中折了很多行的摘要可能并入上一个字段。
- 除导出文件本身包含的内容外，不保留 CNKI 记录 id（`CNKI:`/`DBID`）。

## 许可

Apache-2.0。运行时零第三方代码。
