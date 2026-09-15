# Petrinaut

A component for editing [**Petri nets**](https://en.wikipedia.org/wiki/Petri_net), and progressive support for **SDCPN** (Stochastic Dynamic Coloured Petri Nets).

Currently **under development** and not ready for usage.

## Embedding Petrinaut

The visual editor is exposed as a React component:

```tsx
import { Petrinaut } from "@hashintel/petrinaut";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

const handle = createJsonDocHandle({
  id: "my-net",
  initial: { places: [], transitions: [] },
});

export function App() {
  return <Petrinaut handle={handle} title="My net" />;
}
```

For host applications that own their Petri net data, implement a
`PetrinautDocHandle` adapter and pass it to `<Petrinaut />`. The integration
guide lives in the architecture docs:
[Embedding in a host application](https://github.com/hashintel/hash/blob/main/libs/%40local/petrinaut-arch-docs/content/handle/host-integration.mdx).

### `PetrinautProps`

Pass `title` to show a document title in the top bar. The title is read-only
unless the host also supplies `setTitle`; when supplied, Petrinaut calls it
with edits from the title field.

Use `hideNetManagementControls="except-title"` to hide the document-management
menu items while keeping the title visible, or `"all"` to hide the title and
those menu items.

### Presentation profiles

`presentationProfile` chooses how much editing chrome the component draws:

- `editor`, the default, draws the full authoring surface.
- `review` drops the controls whose only purpose is to change the net: the
  add and delete actions in the sidebar lists and property panels. Source
  code, custom visualizers, the minimap and the viewport settings stay, so a
  reader can still inspect and simulate the model.

The profile is chrome, not enforcement. A host that must not accept edits
passes `readonly` as well, which is what disables the fields themselves:

```tsx
<Petrinaut
  handle={handle}
  title="My net"
  presentationProfile="review"
  readonly
/>
```

## Commands and the palette

Petrinaut registers its user-invocable actions (undo, tools, search, panel
toggles, auto-layout) into a command registry the host owns. The host renders
the palette; Petrinaut ships none.

```tsx
import {
  CommandRegistryProvider,
  useCommands,
} from "@hashintel/petrinaut/react";

<CommandRegistryProvider>
  <Petrinaut handle={handle} />
  <MyPalette /> {/* lists useCommands(), runs registry.execute(id) */}
</CommandRegistryProvider>;
```

Host components add their own commands with `useCommand(command, { when })`;
a command leaves the registry when `when` turns false or the component
unmounts. Outside React, `createCommandRegistry()` and
`combineCommandRegistries()` from `@hashintel/petrinaut-core` create and merge
registries. The guide, with a reference palette, lives in the architecture
docs:
[Commands and the palette](https://github.com/hashintel/hash/blob/main/libs/%40local/petrinaut-arch-docs/content/commands/usage-manual.mdx).

## Petricon

Enable **Petricon (Experimental)** in the viewport settings to use Petricon, the custom
icons throughout the editor. The preference is saved in the browser. Names
outside the experimental pack use their default design-system icons.

The `Petricon` and `PetriconProvider` exports are the named API. The earlier
`ExperimentalIcon` and `ExperimentalIconProvider` exports remain compatible.
`petriconCatalog` describes every icon and its motion; `petriconStudies` groups
alternative designs for math, code, and AI. The website route `/petricon` provides
a searchable collection, state inspector, and paired studies.

The pack covers editor tools, navigation, editing actions, diagnostics, simulation
and data views, entity symbols, and assistant and voice controls.

The SVG components are also available from `@hashintel/petrinaut/ui`:

```tsx
import { Petricon, PetriconProvider, PlaceIcon } from "@hashintel/petrinaut/ui";

<PetriconProvider size={20} weight={400}>
  <PlaceIcon variant="filled" aria-label="Place" />
  <Petricon name="zoomIn" size={16} weight={500} />
</PetriconProvider>;
```

`size` sets the SVG dimensions in pixels. `weight` accepts values from 100 to
700 and defaults to 400; values outside the range are clamped. `variant` accepts
`outline` or `filled` and defaults to `outline`. Filled variants fill icon
silhouettes and preserve interior symbols. Open strokes retain their shape.
The icons inherit `currentColor`, accept
standard SVG props and refs, and are decorative unless given an accessible
label. Weight adjusts stroke thickness on a shared 24-unit grid.

The provider sets size, weight, color, motion, and duration defaults for custom icons, and supplies
the experimental pack to design-system components in its tree, including portals.
Design-system `Icon` sizes continue to follow their existing size tokens.
Use `enabled={false}` to restore the default design-system pack. Explicit custom
icon components still render their requested icon. Nested providers inherit defaults
and can override individual values.

`experimentalIconNames` lists the custom icon names. `experimentalIconPack` maps
design-system names to replacements and can also be passed to the design-system
`IconProvider` as its `icons` prop. Every current design-system icon has a
replacement, including icons rendered internally by shared controls. Partial
packs passed to `IconProvider` still fall back to the default artwork.
Checkbox marks and shared loading indicators keep their default artwork,
independent of the icon pack. The standalone `LoadingIcon` follows Petricon's
motion preferences.

### Effects and transitions

```tsx
<AddPlaceIcon effect="bounce" trigger={creationCount} />;
<AddTransitionIcon
  effect={["rotate", "pulse"]}
  active={isWorking}
  duration={900}
/>;
<AddPlaceIcon
  selected={isSelected}
  variant={isSelected ? "filled" : "outline"}
  transition="spring"
/>;
<Petricon
  name={nodeKind === "place" ? "addPlace" : "addTransition"}
  transition="smooth"
/>;
```

`effect` accepts `action`, `bounce`, `pulse`, `rotate`, or `draw`, or an array that combines
effects. `action` plays the icon's authored response: clocks rewind, parameters
scrub, and subnet cubes make a quarter-turn. Interactive controls play this response
on click when no explicit effect is supplied. Use `interaction="none"` to opt out.
`draw` is supported by Add Place, Add Transition, history/reset, parameters, the
subnet cube, and all modeling studies. The add frame and corner badge draw in order,
and filled add frames use a reveal mask.
`getPetriconEffects(name)` lists the effects supported by an icon.
Unsupported effects leave the artwork unchanged.

For controlled drawing, use `<Petricon name="equationCurve" drawProgress={0.5} />`.
Progress is clamped to 0–1, takes priority over a timed draw effect, and remains
available with motion disabled. Omit it to restore the complete symbol. A timed
draw supports `choreography="together"`, `"stagger"`, or `"sequential"`.

The Modeling studies compare three alternatives each for differential equations
(`differentialEquation`, `equationCurve`, `equationFlow`), parameters (`parameter`,
`parameterDial`, `parameterRange`), variables (`variable`, `variableBrackets`,
`variableRegister`), token types (`tokenType`, `tokenTypeStack`, `tokenTypeTag`),
and subnets (`cube`, `subnetNetwork`, `subnetLayers`). The website and Storybook's
Modeling Studies story expose both their action and drawing effects.

Interactive icons give small hover hints: arrows move in their direction, the
trash lid lifts, the copy sheet separates, and chart bars rise slightly. These
hints apply inside buttons, links, tabs, segmented controls, checkboxes, and highlighted menu items. Decorative
icons stay still. Set `hover="none"` to disable an icon's hint. Disabled controls
and reduced-motion preferences suppress hover motion.

`<PersonRunningIcon />` runs in place while its control is hovered or has keyboard
focus. Clicking makes it jump and land without interrupting the gait. Leaving
the control or moving keyboard focus away stops the run.

`<ShapesIcon selected={isEditing} />` moves each shape independently on hover:
the triangle turns right, the square and diamond tilt, and the circle nudges up.
Selection settles the shapes into a different arrangement, with a right-facing
triangle and the diamond turned into an upright square. Both resting states
keep the four shapes aligned, with the square upright. It also follows a
containing segmented control's checked state or button's `aria-pressed` state.
The editor binds this to Edit mode. These transitions take up to 320ms, with
short delays between shapes; reduced motion preserves the selected arrangement.

`<ParameterIcon />` previews an adjustment on hover or keyboard focus: its knobs
scrub along stationary tracks and return to their original positions. The preview
plays once, lasts up to 480ms, and does not change any parameter values.

`<FlaskIcon selected={isSelected} />` has two overlapping liquid surfaces clipped
inside its outline. The surface is flat at rest. Hovering deforms it into a wave
that travels across the flask and settles back to flat, even if the pointer
leaves before it finishes. The glass stays still. Selection raises the
liquid slightly. `<LayerIcon selected={isSelected} />` separates its layers on
hover and selection. Both respond to pressing their control, then settle when
released. They also follow a containing segmented control's checked state or a
button's `aria-pressed` state, using the shared motion and transition props.
Their state transitions are capped at 300ms for quick feedback; the flask's hover
wave lasts up to 480ms and replays when hovered again. The translucent fill and
surface line keep the liquid visible at small icon sizes.

`<MenuIcon open={isOpen} />` transitions between menu bars and a close symbol.
It also follows a containing button's `aria-expanded` state.
`<PlaybackIcon playing={isPlaying} />` transitions between play and pause, and
`<MicrophoneIcon muted={isMuted} />` draws or removes its mute slash. The editor
connects these icons to the corresponding control states. These transitions use
the shared `duration`, `transition`, and `motion` props.

`<DiagnosticsIcon status="valid" />` transitions between `valid`, `warning`, and
`error` drawings in one SVG. The editor drives it from the language client's
validation counts, so it animates when issues appear or are fixed.

With `trigger`, a one-off effect plays when that string or number changes; it does
not play on mount. Without a trigger it plays on mount and when the effect or
artwork changes. `active={true}` loops; `active={false}` stops. Authored hover
actions do not interrupt an explicitly active action loop. New effects cancel
interrupted ones, and unmounting releases their animations.

`duration` is the complete cycle in milliseconds, including layer staggering. It
defaults to 600, clamps to 100–10000, and replaces non-finite values with 600.
`choreography` accepts `together`, `stagger` (default), or `sequential`.

The add icons show a plain circle or square at rest. Their plus badge appears at
the bottom-right on hover, including when their containing button is hovered.
`badge` accepts `hover` (default), `visible`, or `hidden`. The badge has a transparent
gap around it so it remains distinct from the frame on any background.

For the add icons, `selected` enlarges the frame. Changes to `variant`
transition between outline and filled. Changing
`name` between `addPlace` and `addTransition` on the same `Petricon` morphs
the frame between a circle and a rounded square. `transition` accepts `smooth`
(default), `spring` (an overshooting easing curve), or `none`. Other icon pairs
switch immediately; they have no authored morph yet.

`SidebarIcon` accepts `collapsed` (default `false`). When collapsed, a short
thin vertical line stays close to the left edge of the frame. Hovering restores
its regular weight and moves it slightly right. Expanding restores the full-height
divider, positioned left of center, with a small leftward nudge on hover to suggest closing.
The outer frame stays still. It supports
outline and filled styles and uses the same transition, duration, and motion
settings. The editor connects this state to the sidebar toggle.

`SettingsIcon` has sharp gear teeth and accepts `open` (default `false`). Use
`<SettingsIcon open={isSettingsOpen} duration={240} />` to turn it 30° while its
menu is open and return it to its resting angle when closed. Both settings buttons
in the editor follow their menu's state, including dismissal with Escape or an
outside click. The same transition, duration, and motion settings apply.

`motion="none"` disables effects and transitions while preserving the final
appearance. System reduced-motion preferences also disable motion. The editor
connects this to its **Animations** setting. With the experimental pack enabled,
selecting either add tool fills its icon and plays a short bounce. Motion runs
through inline SVG and browser animation APIs; no animation dependency is needed.

## Storybook

Run Petrinaut's component stories from the repository root:

```bash
yarn workspace @hashintel/petrinaut dev
```

`DiagnosticsIcon` reuses two strokes across `status="valid"`, `"warning"`, and
`"error"`. The strokes move, rotate, and change length to form the check,
exclamation mark, and cross. The editor badge slides its count out from behind
the icon through a gradient mask and resizes smoothly as the count appears,
disappears, or gains digits. Motion settings apply to the entire badge.

The **Petrinaut / Petricon / Catalog** story includes search,
weight and size controls, outline/filled comparison, and a fallback example. Its
motion playground includes experiment and scenario controls, sidebar, settings, menu, playback, microphone, and diagnostics
state transitions, replay, looping, combined effects, layer timing, selection
transitions, plus-badge visibility, and the Add Place ↔ Add Transition morph.
The diagnostics button demo also includes a count control for checking its resize
and reveal transitions.

The **Simulate / SimulateView / Run Supply Chain optimization (synthetic
optimizer)** story creates a parameter sweep with its study, as the Create
Experiment drawer's Optimize does, and drives it with an internal fake
optimizer, so it does not require the Python service or Docker.

## Host-owned interactive AI tools

Hosts can render their own dynamic AI tools inline in Petrinaut's chat panel.
Define each tool with runtime input and output schemas, then pass the resulting
registration through `aiAssistant.interactiveTools`:

```tsx
import {
  definePetrinautAiInteractiveTool,
  Petrinaut,
} from "@hashintel/petrinaut";
import { z } from "zod";

const confirmationTool = definePetrinautAiInteractiveTool({
  toolName: "confirmOperation",
  inputSchema: z.object({ question: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  component: ({ input, state, submit, submittedOutput, toolCallId }) =>
    state === "awaiting" ? (
      <section data-tool-call-id={toolCallId}>
        <p>{input.question}</p>
        <button onClick={() => submit({ approved: true })}>Approve</button>
        <button onClick={() => submit({ approved: false })}>Decline</button>
      </section>
    ) : (
      <p>{submittedOutput.approved ? "Approved" : "Declined"}</p>
    ),
});

<Petrinaut
  aiAssistant={{
    transport,
    interactiveTools: [confirmationTool],
  }}
  handle={handle}
/>;
```

Any object with a `parse(unknown)` method can be used as a schema; Zod is only
an example and is not required by Petrinaut. The input schema is checked when
the dynamic call arrives and again before rendering. The output schema is
checked before Petrinaut calls the AI SDK's `addToolOutput`.

A host can instead register a non-interactive dynamic tool in `aiAssistant.automaticTools`. Each registration names the tool, supplies input and output parsers, and implements `execute({ input, mutations, commands, handle, readDiagnosticsContext, toolCallId, signal })`. Petrinaut validates the input, passes the mounted mutation and command surfaces, the document handle, a `readDiagnosticsContext()` that reports the editor's current TypeScript diagnostics as the built-in compilation read does, and an `AbortSignal` (aborted on Stop or conversation switch), validates the returned output, inserts that one outer result, and continues the turn automatically. When a host tool changes the document, Petrinaut treats diagnostics as pending until they catch up with that change; a host tool that leaves the document unchanged does not. `petrinautDocsContent` (from `/ui`) exposes the user-guide pages the built-in documentation read serves, so a host tool under its own name can answer with the same text.

The component receives a stable `toolCallId` plus a discriminated lifecycle:
`state: "awaiting"` has no submitted output, while `state: "submitted"`
includes the validated `submittedOutput`. While a submission is in flight,
duplicate `submit` calls are ignored. An accepted submission stays one-shot;
if the AI SDK rejects it, the awaiting component can submit again. Once every
pending tool call has output, the existing AI SDK automatic follow-up runs as
usual.

Tool names must be unique within the host registry and must not collide with a
built-in Petrinaut tool such as `applyAutoLayout`. A dynamic tool call with no
matching registration throws `Unknown AI tool: <name>`.

Run the **Petrinaut / With Host Interactive Ai Tool** Storybook story for a
complete synthetic awaiting → submitted → AI follow-up lifecycle.
