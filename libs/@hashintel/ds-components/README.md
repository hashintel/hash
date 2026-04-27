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

Component implementation still uses the generated Panda runtime from `@hashintel/ds-helpers`:

```tsx
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Box, Flex, Stack } from "@hashintel/ds-helpers/jsx";
```

Token lookup helpers and token types should also come from `@hashintel/ds-helpers/tokens`.

## Package Layout

| Area | Location |
| --- | --- |
| Components | `src/components/**` |
| Panda preset source | `src/preset.ts`, `src/preset/**` |
| Token and color generators | `scripts/**` |
| Stories | `src/components/*/*.stories.tsx` |
| Token demo stories | `src/stories/**` |
| Local demo config | `panda.local.config.ts` |
| Ladle harness | `.ladle/**` |
| Snapshot tests | `tests/**` |

## Common Commands

Run these from `libs/@hashintel/ds-components`:

```bash
yarn dev
yarn dev:lib
yarn codegen
yarn lint:eslint
yarn lint:tsc
yarn test:unit
yarn test:snapshots
yarn build
```

`yarn dev` is the primary Ladle-based review loop. Use `yarn dev:ladle` for component-story review and `yarn dev:lib` when you only need the library watcher.
`yarn prepare`/`yarn codegen` generates the shared `../ds-helpers/styled-system`
authoring runtime, and the demo loops rely on Vite/PostCSS for CSS extraction
while the server is running.

## Contributor Docs

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current contributor workflow.
- See [SCRIPT_SURFACE_RECOMMENDATIONS.md](./SCRIPT_SURFACE_RECOMMENDATIONS.md) for the naming conventions applied here and proposed for sibling packages.
- See `AGENTS.md` for package-scoped implementation rules.

## External References

- [Ark UI documentation](https://ark-ui.com)
- [Ark UI MCP Server documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [PandaCSS documentation](https://panda-css.com)
