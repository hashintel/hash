# @hashintel/ds-helpers

Generated PandaCSS runtime for the HASH design system.

`@hashintel/ds-components` is the source of truth for the preset, token inputs,
and component surface. This package exists so the generated Panda
`styled-system` can be published and consumed alongside `@hashintel/ds-components`.

In PandaCSS terms, this is the published `styled-system` layer.

## How `styled-system/` gets here

Panda writes to a directory private to `@hashintel/ds-components` (with
`--clean`, so stale artifacts are swept), and `scripts/sync-styled-system.mjs`
copies it here. Panda must not write here directly: `--clean` empties its
output directory, and when that directory was this package's published payload a
concurrent `changeset publish` worker could empty it while npm was packing —
which is how `0.1.1`, `0.2.0` and `0.2.1` shipped with only their six metadata
files.

Regenerate with `yarn workspace @hashintel/ds-components codegen`.

### `expected-payload.json`

A checked-in list of every file Panda generates for this package. Both the copy
and the pack-time verifier (`scripts/verify-package-contents.mjs`) assert the
payload matches it exactly, so a partially generated tree can neither be copied
in nor published. It is deliberately committed rather than derived at runtime: a
record written by the step that might have truncated the tree cannot detect the
truncation.

If Panda's generated file set legitimately changes — a new pattern, a different
`jsxFramework`, a Panda upgrade — both scripts fail and name the difference.
Regenerate it, and review the diff as part of the change:

```bash
yarn workspace @hashintel/ds-components codegen   # may fail; that is expected
cd libs/@hashintel/ds-helpers
node -e 'const {readdirSync,writeFileSync}=require("node:fs"),{join}=require("node:path");
const l=(d,p="")=>readdirSync(d,{withFileTypes:true}).flatMap(e=>{const r=p?p+"/"+e.name:e.name;
return e.isDirectory()?l(join(d,e.name),r):[r]});
const m=require("./expected-payload.json");
m.files=l("../ds-components/styled-system").sort();
writeFileSync("expected-payload.json",JSON.stringify(m,null,2)+"\n")'
```
