# @hashintel/ds-components

Components for HASH refractive design system, built using React, TypeScript, ArkUI, and PandaCSS.

## Synchronization with Figma

These components rely on variables and styles defined in Figma, which are synchronized using the Figma and ArkUI MCP servers.

Design Tokens are sourced from the `@hashintel/ds-theme` package, which is generated from Figma variables to a Panda CSS preset.

When updating or adding new components, ensure that the design tokens in `@hashintel/ds-theme` are up to date by following the instructions in its README.

To help LLMs find the correct mapping between Figma variables and PandaCSS tokens, a mapping file is available at `libs/@hashintel/ds-components/figma-to-panda-mapping.json`. This file is generated automatically during the design token synchronization process.

> **Note:** Figma MCP server requires the Figma app to be running, and the Figma component to add/update to be open and selected.

## Links

- [ArkUI MCP Server Documentation](https://ark-ui.com/docs/ai/mcp-server)

- [Figma MCP Server Documentation](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
