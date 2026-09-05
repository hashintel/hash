# Embedded Preview

`PetrinautPreview` is a compact, read-only surface for showing a Petri net
inside another application. It is intended for iframe embeds and other
host-controlled pages where the full Petrinaut editor would be too large.

The preview uses the same SDCPN canvas as the full editor. Nodes, arcs,
markings, and other supported visual details therefore appear consistently in
both surfaces. You can pan and zoom the canvas, fit the net into view, and use
the minimap. You cannot move, connect, add, delete, or otherwise edit net
elements.

## Inspecting a net

Select a place, transition, arc, or other supported item to inspect it. The
preview presents the same property information as Petrinaut's inspector,
without source editing or other authoring controls. On a wide embed the
inspector docks to the right of the canvas. On a narrow embed it sits under
the canvas so the canvas remains usable.

Use the compact net selector to move between the root net and its subnets. The
canvas, selection, and inspector update together when you change nets.

## Quick Simulation

Some embeds include Quick Simulation. Open **Quick Simulation** in the header
to choose one of the model's named scenarios and adjust the parameters the
embed makes available. The first scenario is selected when the embed does not
specify a valid one. There is no "No scenario" option in this surface.

The selected scenario's initial marking appears on the shared canvas before a
run starts. Press **Play** in the compact bar at the bottom to start the run;
the preview never starts it automatically. The same bar lets you pause, reset,
choose from the playback speeds allowed by the embed, and scrub through the
frames that have been produced.

As soon as frames arrive, the compact bar expands upward to show a small
timeline. The timeline follows playback, lets you hover to inspect a series,
and supports clicking or dragging to scrub the canvas to another frame. It
collapses again when you reset the simulation. This expansion is animated when
Petrinaut animations are enabled and reduced-motion is not requested.

Quick Simulation uses a fixed time step and time horizon selected by the embed.
It intentionally does not expose the full Simulate workspace, timeline-series
configuration, metric authoring, or controls for changing those run settings.
Scenario parameters are limited to the safe ranges chosen for that embedded
example.

## Navigation and embedding

The application hosting `PetrinautPreview` owns navigation. It can reflect the
selected subnet or item in its URL and restore that state when the page loads;
the preview does not install or access an application router itself.

The Petrinaut demo's oEmbed route replaces its current iframe URL when preview
state changes. This keeps the embed deep-linkable without adding iframe entries
to the embedding page's Browser Back / Forward history.

`PetrinautPreview` supplies the read-only Petrinaut interface, but it does not
decide whether a page may be framed. The host is responsible for its iframe
markup, content-security policy, sandbox permissions, and any other embedding
or security headers.

The preview intentionally omits source code, editing tools, mode and document
management controls, experiments, optimizations, and the AI assistant. Quick
Simulation is available only when the embed supplies it. Use the full Petrinaut
interface when the omitted workflows are needed.
