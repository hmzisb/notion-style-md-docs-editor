---
title: "ADR 0001: Markdown is canonical"
---

# ADR 0001: Markdown is canonical

**Status:** accepted

Markdown files on disk are the source of truth. The editor's JSON is transient
and is never written anywhere.

The argument is set out in [the architecture notes][arch] and in the original
[CommonMark rationale][spec].

[arch]: ../specs/index.md
[spec]: https://commonmark.org/
