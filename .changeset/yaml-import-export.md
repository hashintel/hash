---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Nets and optimization manifests can be imported as YAML as well as JSON, detected from the content. Exports default to YAML, with multi-line code fields written as block scalars; JSON export remains available. Exported documents (both formats) write `version`, `meta`, and `title` first, then the net sections in dependency order.
