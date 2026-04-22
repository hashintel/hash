# @hashintel/ds-components

React components for HASH's refractive design system, built with TypeScript, Ark UI, and PandaCSS.

## Ownership Model

As of the FE-612 ownership restructure:

- `@hashintel/ds-components` owns the Panda preset source, token/codegen scripts, and demo surfaces.
- `@hashintel/ds-helpers` is the generated Panda `styled-system` artifact.
- The old `@hashintel/ds-theme` surface has been folded into `@hashintel/ds-components/preset` and `@hashintel/ds-components/theme`.

For new internal work, treat `ds-components` as the source of truth.

## Public Entry Points

| Entry point | Purpose |
| --- | --- |
| `@hashintel/ds-components` | Published component entrypoints from `src/components/*.tsx` |
| `@hashintel/ds-components/preset` | Panda preset helpers such as `preset`, `createPreset`, and `scopedThemeConfig` |
| `@hashintel/ds-components/theme` | Package-owned theme facade re-exporting from `src/preset/theme` |
| `@hashintel/ds-components/tokens` | Package-owned token facade for `token()` and token types |

Component implementation still uses the generated Panda runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Box, Flex, Stack } from "@hashintel/ds-helpers/jsx";
```

## Package Layout

| Area | Location |
| --- | --- |
| Components | `src/components/**` |
| Panda preset source | `src/preset.ts`, `src/preset/**` |
| Token and color generators | `scripts/**` |
| Storybook stories | `src/components/*/*.stories.tsx` |
| Token demo stories | `src/stories/**` |
| Ladle harness | `.ladle/**`, `panda.ladle.config.ts`, `vite.ladle.config.ts` |
| Snapshot tests | `tests/**` |

## Common Commands

Run these from `libs/@hashintel/ds-components`:

```bash
yarn codegen
yarn codegen:ladle
yarn lint:eslint
yarn lint:tsc
yarn storybook
yarn dev:ladle
yarn test:snapshots
yarn build
```

## Contributor Docs

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current contributor workflow.
- See `AGENTS.md` for package-scoped implementation rules.

## External References

- [Ark UI documentation](https://ark-ui.com)
- [Ark UI MCP Server documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [PandaCSS documentation](https://panda-css.com)
