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
inspector opens as an overlay on the right. On a narrow embed it opens as a
bottom sheet so the canvas remains usable.

Use the compact net selector to move between the root net and its subnets. The
canvas, selection, and inspector update together when you change nets.

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
management controls, experiments, optimizations, and the AI assistant. Use the
full Petrinaut interface when those workflows are needed.
