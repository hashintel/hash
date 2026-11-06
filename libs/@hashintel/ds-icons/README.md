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

## Outline and filled variants

Use `variant="outline"` (the default) or `variant="filled"` on `HashIcon` or any
named icon component. Filled artwork uses `currentColor`; interior marks such as
keyholes, checkmarks, and dice pips are transparent cutouts, so they work on light,
dark, and colored surfaces. Both styles retain the same hover and state behavior.

Closed symbols have filled bodies, including modeling nodes, shapes, files,
notifications, and status indicators. Open symbols such as arrows, equations,
and text retain their line artwork in both variants. Do not rely on fill alone
to communicate a selected state: pair it with an accessible state or text label.

```tsx
<HashIcon name="bell" variant="filled" aria-label="Notifications" />
```

The Symbols set includes the official Model Context Protocol mark as `McpServerIcon` or `<HashIcon name="mcpServer" />`, labeled **MCP Server** in the AI category. Its paths and stroke proportions stay fixed across `weight`, `strokeWidth`, and `variant` settings; `size` and `color` work as usual. See the [artwork notice](./THIRD-PARTY-NOTICES.md#mcp-server-symbol) for provenance and licensing.

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

## One-time and continuous animations

Prefer one-time animations for hover feedback and completed actions. They acknowledge
an interaction without competing with the rest of the interface. The default hover
behavior plays once or settles into a hover pose; Person Running completes one gait
cycle instead of running indefinitely.

Use `animationMode="once"` (the default) or `animationMode="continuous"` to choose
whether an effect repeats. Reserve continuous motion for an ongoing process, such
as loading or playback, and stop it when that process ends. `HashIconProvider`
can set the mode for a subtree; individual icons can override it.

```tsx
// Either mode can run on hover or keyboard focus of the enclosing control.
<button type="button">
  <HashIcon name="personRunning" hoverEffect="bounce" animationMode="once" />
  Run simulation
</button>;

<button type="button">
  <HashIcon
    name="personRunning"
    hoverEffect="bounce"
    animationMode="continuous"
  />
  Preview running
</button>;

// An explicit effect can also follow application state.
<HashIcon
  name="loading"
  effect="rotate"
  animationMode="continuous"
  active={isLoading}
/>;
```

`hoverEffect` accepts `action`, `bounce`, `pulse`, `rotate`, or `draw` (check
`getHashIconEffects(name)` for supported effects). It replaces the default hover
hint and plays only while the enclosing control is hovered or keyboard-focused.
Leaving both states cancels the effect; re-entering plays it again. With no
`hoverEffect`, `animationMode` also controls repetition of the icon's authored
hover keyframes. Static hover poses and application-state transitions do not loop.

Use `effect` with a changing `trigger` for a one-time response to an application
event. Use `active={false}` to stop an explicit effect. For compatibility,
`active={true}` without an explicit or inherited mode still repeats; prefer naming
the mode in new code. `LoadingIcon` explicitly defaults to continuous rotation.

Both modes respect `prefers-reduced-motion` and `motion="none"`. Hover effects
also honor `hover="none"` and disabled controls. Keep essential status information
in text or accessible labels;
never communicate it through animation alone.

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

## Icon-specific documentation

### Test tubes

Use `testTube` for an experiment without a result, `testTubeCheck` for a successful
test, and `testTubeCross` for a failed test. The previously checked `testTube`
artwork is now named `testTubeCheck`. Each has a named component (`TestTubeIcon`,
`TestTubeCheckIcon`, and `TestTubeCrossIcon`) and supports outline and filled
variants. The liquid shifts on hover; the check or cross also pulses briefly.

### Sort-by icons

The Editing category includes these paired sort indicators. Each pair reverses
both the arrow direction and the order of the symbols or lines. Use an accessible
label that names the actual order; arrow direction alone is ambiguous.

| Family              | Down variant                              | Up variant                               |
| ------------------- | ----------------------------------------- | ---------------------------------------- |
| General             | `sortDown`: three shortening lines        | `sortUp`: three lengthening lines        |
| Alphabetical        | `sortDownAlphabetical`: A above Z         | `sortUpAlphabetical`: Z above A          |
| Numeric             | `sortDownNumeric`: 1 above 9              | `sortUpNumeric`: 9 above 1               |
| Shape / object type | `sortDownShapes`: circle above pyramid    | `sortUpShapes`: pyramid above circle     |
| Size                | `sortDownSize`: four lines, largest first | `sortUpSize`: four lines, smallest first |

Every name also has a named component, such as `SortDownShapesIcon` or
`SortUpSizeIcon`, and an entry in `hashIconPack`. The existing general,
alphabetical, and numeric exports remain available. Related-icon metadata links
each opposite and alternative sort family. Sort icons use the same one-time
hover feedback as the rest of the set; continuous effects remain opt-in.

## Integrations

`IntegrationIcon` provides a separate **Integrations** category with 992 current brand identities, 28 legacy identities, and a generic fallback. It covers HASH's integration listings and additional company and product brands. `integrationIconCatalog` lists the brands, integration-name aliases, supported variants, artwork sources, and curated `categories`. The top-level `category` remains `Integrations`; `categories` groups brands by sector or purpose, with multiple categories where relevant. `integrationIconCategories` lists the available categories, and `IntegrationIconCategory` is their TypeScript union. The generic fallback has no brand categories. These icons use SVG and need no Panda configuration.

```tsx
import {
  IntegrationIcon,
  integrationIconNameByIntegration,
} from "@hashintel/ds-icons/integrations";

<IntegrationIcon name="slack" variant="mark-mono" fill="#60758A" size={24} />;
<IntegrationIcon name="sap" variant="app-light" size={44} />;
<IntegrationIcon name="linear" variant="logo-dark" size={28} title="Linear" />;
<IntegrationIcon
  name={integrationIconNameByIntegration["Oracle Cloud SCM"] ?? "genericApp"}
  variant="app-light"
  size={44}
/>;
```

The same exports are available from the package root for applications using legacy TypeScript module resolution.

| Variant      | Appearance                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `mark-mono`  | Backgroundless mark in `currentColor`, `color`, or `fill`. Alpha tones preserve internal detail while keeping one hue. |
| `mark-light` | Backgroundless brand colors for a light background.                                                                    |
| `mark-dark`  | Backgroundless brand colors adjusted for a dark background.                                                            |
| `app-light`  | Brand artwork on a rounded, partly transparent light tile.                                                             |
| `app-dark`   | Brand artwork on a rounded, partly transparent dark tile.                                                              |
| `logo-light` | Full wordmark or lock-up in brand colors for a light background.                                                       |
| `logo-dark`  | Full wordmark or lock-up adjusted for a dark background.                                                               |

`size` is the height in pixels. Marks and app tiles are square; full logos use their natural aspect ratio. SVG props such as `width`, `height`, `className`, and `style` remain available. App tiles preserve the catalogue's brand sizing and SAP's left alignment. Every instance gets unique gradient, mask, clip, filter, and title IDs.

App tiles share a translucent tinted surface, soft sheen, and reflective corner rim in both modes. Their SVG backgrounds remain partially transparent, including when exported as standalone assets.

Icons are decorative unless given `title`, `aria-label`, or `aria-labelledby`. The default variant is `mark-mono`. The mono mark applies the caller's hue to the completed artwork, so overlapping shapes, masks, and gradients retain their detail on either background.

661 non-legacy brands have all seven variants. Brands without a verified full logo expose only the five mark and tile variants. Check each catalogue entry’s `variants` before showing a logo selector; requesting an unavailable full logo throws an error. The Font Awesome comparison groups alternate, square, circle, and card glyphs under distinct identities. Its coverage map and exclusions are recorded in `src/integration-icon/fontawesome-coverage.json`.

Gmail full logos embed authentic PNG artwork. All other full logos are vectors. Microsoft Teams pairs its product mark with outlined Segoe UI Semibold lettering, matching the other Microsoft product logos. Veeva Vault pairs its mark with Veeva's corporate wordmark. BigQuery and Redshift use archived product lock-ups; the source and any limitations are recorded in the catalogue and [third-party notices](./THIRD-PARTY-NOTICES.md).

The package includes 6,435 standalone SVGs. They are exported as `@hashintel/ds-icons/integrations/svg/<slug>/<variant>.svg`, for example `@hashintel/ds-icons/integrations/svg/slack/app-light.svg`. To recolor a mono SVG, inline it and set `color`; an external `<img>` cannot inherit the surrounding document's color.

`microsoftWord`, `microsoftOutlook`, `microsoftExcel`, `microsoftPowerPoint`, `microsoftOneNote`, `microsoftOneDrive`, and `microsoftCopilot` provide all seven variants using current Microsoft product marks. Copilot uses the two-part 2026 mark. Their full logos pair each mark with outlined Segoe UI Semibold lettering, using the same spacing and light/dark text colors as Teams. These are composed lock-ups; no fonts are loaded at runtime.

`microsoftTeams` uses the current rounded Teams mark. `microsoftTeamsLegacy` preserves the previous mark and full-logo compositions; the “Microsoft Teams” integration alias always uses the current artwork.

`hash` uses the blue gradient mark and vector wordmark from hash.ai. Its full logos preserve the site’s lock-up proportions, with dark lettering for light mode and white lettering for dark mode. App tiles align the mark flush to the bottom-right edge at 60% of the tile height, using `appViewBox` to position it independently of the backgroundless marks. All seven variants are available.

`amazon` is the corporate brand, separate from `amazonRedshift`. Its marks and tiles use the current orange smile. Full logos preserve the complete wordmark-and-smile arrangement, with Squid Ink lettering for light mode and white lettering for dark mode. All seven variants are native vectors.

`apple` is the corporate brand, separate from `appleNotes` and `appleHealth`. Its native SVG symbol is black in light mode and white in dark mode; its mono variant uses the caller's hue. The “Apple” alias resolves only to this corporate entry.

`appleHealth` provides a backgroundless heart vectorized from Apple's current App Store artwork, with its pink-to-red gradient and subtle bevel. Its app variants preserve the original upper-right heart placement and scale on the shared translucent tiles; the “Apple Health” integration alias resolves to this set.

`messenger` uses Meta’s current Facebook Blue mark in all variants, including the full logos. `messengerLegacy` preserves the previous multicolor mark in all seven variants, with black lettering in `logo-light` and white lettering in `logo-dark`. Current Messenger wordmarks stay blue in both modes. Both full-logo compositions optically center the main letter shapes with the speech bubble. The “Messenger” integration alias resolves to the current blue set.

`granola` uses the current swirl identity. `granolaLegacy` preserves the retired g-and-cursor mark; the “Granola” integration alias always resolves to the current artwork.

`kinaxis` provides the corporate wordmark. `kinaxisMaestro` provides the Maestro emblem and the full “Maestro by Kinaxis” lock-up. The “Kinaxis Maestro” integration alias resolves to `kinaxisMaestro`. Both entries use vector artwork without embedded raster images.

Where a source provides only a wordmark, the full logo pairs it with the sourced brand mark. These composed lock-ups are identified in `logoNotes`; brands whose mark is already their wordmark keep that artwork.

### Maintaining the artwork

The shared app-tile backgrounds live in `src/integration-icon/app-tile/`. The generator uses these SVGs for both the React tile components and standalone app variants.

Edit the reviewed SVGs in `src/integration-icon/artwork` and the source, alias, sizing, and palette metadata in `src/integration-icon/brands.json`. Then run `yarn generate:integrations` and the package checks. The generator uses `uv` to install its pinned `defusedxml` dependency and rejects SVG document types and entity definitions. The generator writes both React geometry and standalone variants from those sources and removes obsolete SVG variants. `logoLayout` controls the wordmark height and gap when composing a lock-up; an optional `logo-mark.svg` supplies a mark without embedded lettering.

After building the package, run `node scripts/preview-integrations.ts /path/to/integration-icons.html` to create a self-contained review grid. It includes light and dark backgrounds, a transparency toggle, and a mono color toggle.

OpenAI and ChatGPT, Anthropic and Claude, and Amazon, AWS, and Amazon S3 have distinct catalogue entries. `luma` is the events platform. `twitterLegacy` preserves the former blue bird separately from `x`. The new Google Workspace product marks use the current 2026 artwork; their full logos use outlined Google Sans. Amazon S3, EC2, DynamoDB, RDS, CloudFront, Lambda, Amplify, and Amazon Q use outlined Amazon Ember in composed full logos. The AWS products use standalone product identities, including archived dimensional marks for DynamoDB, RDS, and CloudFront, rather than the current architecture tiles. Clay’s raster mark from its official kit has been vectorized, with the kit’s native wordmark preserved. Source metadata records these compositions and conversions.
