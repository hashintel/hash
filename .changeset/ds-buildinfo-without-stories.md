---
"@hashintel/ds-components": patch
"@hashintel/ds-helpers": minor
---

Stop shipping invalid styles in `panda.buildinfo.json`: those extracted from story and test files, and from component props named like CSS properties (`position`, `overflow`, `width`, `direction`). The `@hashintel/ds-helpers/jsx` components now take styles through the `css` prop and their pattern props only (`<VStack gap="2" css={{ alignItems: "center" }}>`), not as individual style props.
