---
"@hashintel/ds-components": patch
"@hashintel/ds-helpers": patch
"@hashintel/ds-theme": patch
---

Alignment of panda-css preset + styled-system + components externaliztion architecture

**@hashintel/ds-theme**
Restructure as Panda CSS preset; add codegen scripts transforming Figma variable exports to token definitions; dual exports (preset + raw theme); migrated to tsdown; new token naming conventions (e.g. `gray.20` not `core.gray.20`, `md.4` not `radius.4`)

**@hashintel/ds-helpers**
Generate styled-system utilities via panda codegen using ds-theme preset; export css/cva/tokens/jsx/patterns modules; add Ladle stories for token visualization; add Playwright snapshot testing for visual regression

**@hashintel/ds-components**
Align with Panda CSS component library pattern; import styling from local styled-system via importMap; update all token references to new naming conventions; components: Avatar, Badge, Button, Checkbox, RadioGroup, SegmentedControl, Slider, Switch
