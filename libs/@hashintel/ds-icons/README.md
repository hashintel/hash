# @hashintel/ds-icons

Animated SVG icons with adjustable stroke weight, subtle action hints, state transitions and configurable motion.

## Install

```sh
npm install @hashintel/ds-icons
```

Peer dependencies: `react` and `react-dom` (19+).

## Usage

```tsx
import { ExperimentalIconProvider, PlayIcon } from "@hashintel/ds-icons";

<ExperimentalIconProvider size={20} weight={500}>
  <PlayIcon aria-label="Play" />
</ExperimentalIconProvider>;
```

`ExperimentalIcon` renders any icon by `name`; the `*Icon` components are fixed-name shortcuts. `experimentalIconNames` lists every name. The `Petricon*` exports are aliases of the same API.

The provider's `enabled` prop only sets the value `useExperimentalIconPackEnabled` returns. Icons render either way; a host uses it to decide whether to swap its own icons for these.

`experimentalIconPack` maps every `@hashintel/ds-components` icon name to an icon from this set. Pass it to that package's `IconProvider` to swap the design-system icons for these.

## Styles

The icons style themselves with Panda CSS. The package ships no stylesheet. Instead, add its build info and preset to the Panda config of the application that renders the icons:

```ts
import { defineConfig } from "@pandacss/dev";
import { dsIconsPandaPreset } from "@hashintel/ds-icons/panda-preset";

export default defineConfig({
  presets: [dsIconsPandaPreset],
  include: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@hashintel/ds-icons/dist/panda.buildinfo.json",
  ],
});
```

The preset defines the keyframes the icon animations use.
