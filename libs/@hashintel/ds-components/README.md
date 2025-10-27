# @hashintel/ds-components

Components for HASH refractive design system, built using React, TypeScript, ArkUI, and PandaCSS.

## Contributing

For detailed instructions on adding or updating components, see [CONTRIBUTING.md](./CONTRIBUTING.md).

This guide includes:

- Step-by-step workflow for new components
- Design token mapping
- Common patterns and examples
- Troubleshooting tips
- LLM-optimized instructions

## Synchronization with Figma

These components rely on variables and styles defined in Figma, which are synchronized using the Figma and ArkUI MCP servers.

Design Tokens are sourced from the `@hashintel/ds-theme` package.

When updating or adding new components, ensure that the design tokens in `@hashintel/ds-theme` are up to date by following the instructions in its README.

To help LLMs find the correct mapping between Figma variables and PandaCSS tokens, a mapping file is available at `libs/@hashintel/ds-theme/figma-to-panda-mapping.json`.

> **Notes:**
>
> - Figma MCP server requires the Figma app to be running.
>
> - Component to add/update should be open and selected inside Figma.
>
> - ArkUI MCP config should not be committed to the repository. Instead, configure it in your User MCP config.

## Links

- [ArkUI MCP Server Documentation](https://ark-ui.com/docs/ai/mcp-server)

- [Figma MCP Server Documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
