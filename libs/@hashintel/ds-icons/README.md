# @hashintel/ds-icons

Animated SVG icons with adjustable stroke weight, subtle action hints, state transitions and configurable motion.

## Install

```sh
npm install @hashintel/ds-icons
```

Peer dependencies: `react` and `react-dom` (19+).

## Usage

```tsx
import { HashIconProvider, PlayIcon } from "@hashintel/ds-icons";

<HashIconProvider size={20} weight={500}>
  <PlayIcon aria-label="Play" />
</HashIconProvider>;
```

`HashIcon` renders any icon by `name`; the `*Icon` components are fixed-name shortcuts. `hashIconNames` lists every name.

The provider's `enabled` prop only sets the value `useHashIconPackEnabled` returns. Icons render either way; a host uses it to decide whether to swap its own icons for these.

`hashIconPack` maps every `@hashintel/ds-components` icon name to an icon from this set. Pass it to that package's `IconProvider` to swap the design-system icons for these.

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

## Catalog metadata

`hashIconCatalog` lists each canonical icon with a label, category, description,
related-icon names, motion hint, and optional study name.

```ts
import { hashIconCatalog } from "@hashintel/ds-icons";

const place = hashIconCatalog.find(({ name }) => name === "place");
// place.description explains the place symbol and its default hover behavior.
// place.related includes "addPlace" and "transition".
```

Use `description` for an individual icon's shape, purpose, and default interaction.
Hover descriptions assume motion is enabled and the icon is inside a supported
interactive control or preview. Explicit animation effects and state props may
change that behavior. This descriptive text does not replace an accessible label
for the action a control performs.

`related` contains curated canonical names in catalog order. Relationships are
reciprocal and contain no aliases, duplicates, or self-links. An empty array means
no relationship has been curated; icons are not related solely because they share
a category.

`motion` is the existing motion hint, not a prose description. `hashIconStudies`
still groups design alternatives and describes the group as a whole; its `motion`
text should not be used as an individual icon's description.
