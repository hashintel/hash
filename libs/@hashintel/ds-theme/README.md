# @hashintel/ds-theme

A Panda CSS preset for HASH's design system, providing a consistent and reusable set of design tokens and styles for building user interfaces.

This is used by `@hashintel/ds-helpers`, which in turn is used by `@hashintel/ds-components` and apps that use this design system.

## Synchronization of Figma Variables

`src/index.ts` contains the PandaCSS preset definition, which is generated from Figma variables, exported using this plugin: https://www.figma.com/community/plugin/1491572182178544621/variables-exporter-for-dev-mode

To update the design tokens in this package:

1. Open the Figma file containing the design system.
2. Run the "Variables Exporter for Dev Mode" plugin.
3. Copy the generated JSON into a file in this repository
4. Run `yarn generate:panda ./path/to/figma-variables.json` to regenerate the Panda CSS preset.

> **Note**: As Figma does not expose everything through variables (e.g. shadows), shadows and maybe other things will need to be manually added to `src/index.ts` after generation.
>
> Linear ticket for adding a base template:
>
> https://linear.app/hash/issue/H-5521/design-system-tokens-add-base-preset-for-manually-defined
