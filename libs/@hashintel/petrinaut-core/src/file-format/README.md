---
layer: core.file-format
name: File format
role: Reads and writes the on-disk SDCPN document format, plus export converters
invariants:
  - Parsing is the only entry point for untrusted document input, so it validates rather than trusting shape
---

# File format

Serialisation for saved nets: `parse-sdcpn-file.ts` and `serialize-sdcpn.ts` are
the round-trip pair, `remove-visual-info.ts` strips canvas positions for diffing
or headless use, and `sdcpn-to-tikz.ts` exports a net as TikZ for papers.

Anything that reads a file a user supplied goes through the parser here.
Schema migration for older documents lives alongside the document model, not in
this layer — this layer's job ends at producing a well-formed current-version
document.
