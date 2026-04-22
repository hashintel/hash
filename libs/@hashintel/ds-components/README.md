# @hashintel/ds-components

React components for HASH's refractive design system, built with TypeScript, Ark UI, and PandaCSS.

## Current Ownership Status

As of the FE-612 restructure:

- `@hashintel/ds-components` owns the Panda preset source, token/codegen scripts, and demo surfaces
- `@hashintel/ds-helpers` is the thin generated `styled-system` artifact
- `@hashintel/ds-theme` is a compatibility shim that re-exports from `ds-components`

If this README or deeper contributor docs mention `ds-theme` as the source of truth, treat that as stale and follow the package `AGENTS.md` files instead.

## LLM-Driven Development

**Component development is primarily handled by LLM coding assistants** (GitHub Copilot, Claude, etc.) using the [CONTRIBUTING.md](./CONTRIBUTING.md) as instructions.

### For LLM Assistants

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for complete implementation instructions including:

- Figma design context retrieval via MCP
- Ark UI pattern integration
- Design token mapping
- Component structure and patterns
- Storybook stories creation

### For Human Developers

Use LLM assistants to add or update components. Direct manual implementation is only needed for:

- Complex edge cases beyond current LLM capabilities
- Bug fixes requiring deep debugging
- Architectural changes

**Quick setup:**

1. Ensure Figma Desktop app is running with the design file open
2. Have Figma MCP Server configured in Figma app
3. Have Ark UI MCP Server configured in your User MCP config (not committed to repo)
4. Select the component in Figma you want to implement
5. Ask your LLM assistant to implement the component
6. **Review the component** in Storybook to verify rendering and behavior match the design
7. Make manual adjustments if needed for edge cases or visual refinements

## Design System Architecture

**Design Tokens:** Defined in `src/preset/**` and generated/updated from `scripts/**`

**Generated Runtime Styling:** Emitted into [`@hashintel/ds-helpers`](../ds-helpers) via Panda `outdir`

**Styling System:** [PandaCSS](https://panda-css.com) provides type-safe styling with design tokens fully type-checked at compile time. Invalid tokens or outdated token names (from Figma updates or mapper changes) will produce TypeScript errors, ensuring design system consistency.

**Component Base:** Built on [Ark UI](https://ark-ui.com) for accessibility and behavior patterns

## External Resources

- [Ark UI MCP Server Documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server Documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
