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
// place.description explains what the place symbol represents.
// place.related includes "addPlace" and "transition".
```

Each `description` is one sentence explaining the icon's shape and meaning.
Animation controls and motion hints are separate. This descriptive text does not
replace an accessible label for the action a control performs.

`related` contains curated canonical names in catalog order. Relationships are
reciprocal and contain no aliases, duplicates, or self-links. An empty array means
no relationship has been curated; icons are not related solely because they share
a category.

`motion` is the existing motion hint, not a prose description. `hashIconStudies`
still groups design alternatives and describes the group as a whole; its `motion`
text should not be used as an individual icon's description.

## Icon-specific documentation

### Sort-by icons

The Editing category includes these paired sort indicators. Each pair reverses
the arrow direction; pairs with two symbols or varying line lengths also reverse
their order. Use an accessible label that names the actual order; arrow direction
alone is ambiguous.

| Family              | Down variant                                      | Up variant                                     |
| ------------------- | ------------------------------------------------- | ---------------------------------------------- |
| General             | `sortDown`: three shortening lines                | `sortUp`: three lengthening lines              |
| Alphabetical        | `sortDownAlphabetical`: A above Z                 | `sortUpAlphabetical`: Z above A                |
| Boolean             | `sortDownBoolean`: cross above tick (false first) | `sortUpBoolean`: tick above cross (true first) |
| Date                | `sortDownDate`: oldest first                      | `sortUpDate`: newest first                     |
| Duration            | `sortDownDuration`: shortest first                | `sortUpDuration`: longest first                |
| Priority            | `sortDownPriority`: high priority first           | `sortUpPriority`: low priority first           |
| Empty values        | `sortDownEmptyValues`: missing first              | `sortUpEmptyValues`: populated first           |
| Numeric             | `sortDownNumeric`: 1 above 9                      | `sortUpNumeric`: 9 above 1                     |
| Shape / object type | `sortDownShapes`: circle above triangle           | `sortUpShapes`: triangle above circle          |
| Size                | `sortDownSize`: four lines, largest first         | `sortUpSize`: four lines, smallest first       |

The upper symbol is larger than the lower one to emphasize the starting value.
For booleans, use labels such as “False first” and “True first” rather than
relying on the arrow to communicate the order.

Every name also has a named component, such as `SortDownShapesIcon` or
`SortUpSizeIcon`, and an entry in `hashIconPack`. The existing general,
alphabetical, and numeric exports remain available. Related-icon metadata links
each opposite and alternative sort family. Sort icons use the same one-time
hover feedback as the rest of the set; continuous effects remain opt-in.

### Logic operators and verification

The Logic category includes the following operators and verification concepts.
All use the shared weight scale and keep their strokes open in both styles.
Filled dots mark states or events where that distinction carries meaning.

| Name              | Meaning                                     |
| ----------------- | ------------------------------------------- |
| `logicAnd`        | All conditions hold.                        |
| `logicOr`         | At least one condition holds.               |
| `logicNot`        | Negates a condition.                        |
| `logicImplies`    | One condition implies another.              |
| `logicEquivalent` | Two conditions are logically equivalent.    |
| `logicForAll`     | A condition holds for every member.         |
| `logicExists`     | Some member satisfies a condition.          |
| `logicNext`       | Highlights the next state in a sequence.    |
| `logicUntil`      | A condition persists until an event occurs. |
| `logicBranching`  | A state has alternative possible futures.   |

### Temporal logic

The Logic category includes three Signal Temporal Logic representations and
three Linear Temporal Logic representations:

| Name                     | Representation                                 |
| ------------------------ | ---------------------------------------------- |
| `logicSignalBounded`     | A waveform with a marked time interval         |
| `logicSignalThreshold`   | A waveform crossing a predicate threshold      |
| `logicSignalClock`       | A waveform beside a clock                      |
| `logicStateSequence`     | Successive states on one execution path        |
| `logicTemporalOperators` | Always and eventually symbols above a timeline |
| `logicBooleanTrace`      | True and false values stepping through time    |

Each name also has a component such as `LogicSignalBoundedIcon` and an entry in
`hashIconPack`. These are visual representations, so use an accessible label
that identifies the logic or operation in context.

## Brand artwork

Brand artwork is maintained separately in the private `@hashintel/salt-brands` package. This package contains symbol icons and does not include a brand catalogue or brand assets.
