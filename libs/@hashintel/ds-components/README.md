# @hashintel/ds-components

React components for HASH's refractive design system, built with TypeScript, Ark UI, and PandaCSS.

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

**Design Tokens:** Defined in [`@hashintel/ds-theme`](../ds-theme) package, synchronized from Figma variables

**Token Mapping:** [`figma-to-panda-mapping.json`](../ds-theme/figma-to-panda-mapping.json) (automatically generated) translates Figma variables to PandaCSS tokens

**Styling System:** [PandaCSS](https://panda-css.com) provides type-safe styling with design tokens fully type-checked at compile time. Invalid tokens or outdated token names (from Figma updates or mapper changes) will produce TypeScript errors, ensuring design system consistency.

**Component Base:** Built on [Ark UI](https://ark-ui.com) for accessibility and behavior patterns

## External Resources

- [Ark UI MCP Server Documentation](https://ark-ui.com/docs/ai/mcp-server)
- [Figma MCP Server Documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
