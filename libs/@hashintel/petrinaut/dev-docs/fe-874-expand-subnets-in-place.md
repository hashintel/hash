# FE-874 — Expand subnets in place with automatic layout

_Research + prototype notes. The prototype is implemented on this branch and
demonstrated by the Storybook story **"Subnets — expand in place (FE-874
prototype)"** (`cd libs/@hashintel/petrinaut && yarn dev`)._

## Summary

**Yes, this is possible with React Flow, and the prototype works.** React Flow
12 supports nested nodes ("subflows"): a node with `parentId` is positioned
relative to its parent, and edges may cross the parent boundary freely. Because
Petrinaut's canvas is fully controlled — every node is re-derived from the
SDCPN model on each render — we can display something different from what the
model stores without touching the model at all. That is exactly the shape the
ticket asks for: _"the current x,y positions that we expose are not what we
necessarily display."_

The prototype makes expansion a **pure view-layer state**:

- double-click a component instance box → it becomes a large "frame" node
  containing the subnet's internal places/transitions, laid out by ELK;
- the surrounding net is **displaced at display time** to make room — stored
  positions never change;
- double-click the frame → collapses back, and the net returns to its stored
  positions.

## What the prototype does (files on this branch)

| Piece                                                                                     | File                                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Expansion state, ELK layout of the subnet, displacement math                              | `src/ui/views/SDCPN/hooks/use-expanded-subnets.ts`                   |
| Frame node component (header + dashed border)                                             | `src/ui/views/SDCPN/components/expanded-component-instance-node.tsx` |
| Node/edge derivation: frame + namespaced children, displaced positions, rewired port arcs | `src/ui/views/SDCPN/hooks/use-sdcpn-to-react-flow.ts`                |
| Double-click handler, connection/hover/selection guards                                   | `src/ui/views/SDCPN/sdcpn-view.tsx`                                  |
| Drag commits mapped displayed → stored coordinates                                        | `src/ui/views/SDCPN/hooks/use-apply-node-changes.ts`                 |
| New `componentInstanceExpanded` node type                                                 | `src/ui/views/SDCPN/reactflow-types.ts`                              |
| Demo fixture: root net + two instances of the same Warehouse subnet                       | `src/ui/petrinaut.stories.tsx`                                       |

### Mechanism

1. **Expand** (`onNodeDoubleClick` on a `componentInstance` node): run the
   existing `calculateGraphLayout` (ELK, `layered`, direction RIGHT — the same
   engine behind the "Layout" menu action) over the referenced subnet. The
   result plus a header offset gives child positions and the frame size. This
   is stored in React state keyed by **instance id** (not subnet id — two
   instances of the same subnet expand independently).
2. **Render**: the instance node switches to type `componentInstanceExpanded`
   with the computed width/height. Subnet elements are emitted as child nodes
   with `parentId` = instance id and ids namespaced as
   `<instanceId>::<elementId>` so multiple instances of one subnet never
   collide. Children are `draggable: false / selectable: false /
connectable: false` — a read-only projection of the subnet definition.
3. **Arc rewiring**: arcs that end on a `componentPort` of an expanded instance
   attach **directly to the port place node inside the frame** instead of the
   port handle on the box. Arc ids stay identical, so selection/hover logic is
   unaffected. The subnet's internal arcs are also rendered (namespaced,
   non-selectable).
4. **Displacement** (`computeExpansionShift`): an expanded frame grows
   symmetrically around the instance's stored center. Every other node's
   _displayed_ position is shifted away from that center by half the growth on
   each axis ("insert space" rule):
   `displayed = stored + Σ ±(Δw/2, Δh/2)` over all expanded instances.
   The rule is **deterministic and invertible from stored positions**, which is
   what makes dragging work while expanded: on drag-end,
   `useApplyNodeChanges` maps the displayed drop position back through the
   inverse shift before committing, so the model always stores undisplaced
   coordinates. Undo/redo and multiplayer stay consistent.

### What was verified (Playwright against the Storybook story)

- Expanding either or both instances of the same subnet renders the correct
  node/edge counts, ELK-arranged content, and edges flowing from the root net
  into the inner port places and out again.
- Dragging a root place while both instances are expanded commits exactly two
  model patches (`replace /places/0/x`, `/y`) with no visual snap-back — the
  displayed↔stored round-trip is consistent.
- Collapsing restores the box, reattaches arcs to its port handles, and the
  surrounding net returns to its stored positions.

## Design decisions

**View-layer expansion, not model mutation.** Expanding is an inspection
gesture; it must be non-destructive, undo-neutral, and per-user. The model
keeps one source of truth (`ComponentInstance` + `Subnet`), and the simulation
engine's existing runtime flattening
(`petrinaut-core/src/simulation/engine/flatten-component-instances.ts`)
remains the only place that materializes subnet contents.

**Reuse the existing ELK pipeline.** `calculateGraphLayout` already accepts a
subnet (it only reads `places`/`transitions`/`componentInstances`) and returns
center coordinates with padding. No new layout dependency, and expanded
content matches the aesthetic of the "Layout" action.

**"Insert space" displacement instead of physics.** The ticket suggests "some
kind of force" from subnet elements onto parent ones. A literal force
simulation (d3-force) is iterative and non-deterministic, which breaks the
requirement that drags remain committable: we need `displayed → stored` to be
a well-defined inverse function. The half-plane shift is O(nets), stable,
cannot create new overlaps, and inverts trivially. Its known cosmetic cost:
nodes diagonal to the frame move diagonally, and nodes far above/below still
shift horizontally — acceptable in practice (see screenshots/story).

## Alternatives considered

1. **Model-level flattening** — replace the instance with copies of the
   subnet's places/transitions (what the simulator does at runtime). Simple to
   build (reference implementation exists), but destructive: component
   semantics, parameter bindings, and the subnet link are lost. Right shape
   for a future explicit "inline component" action, wrong shape for
   expand/inspect.
2. **Full-net ELK re-layout on expand** — give ELK the expanded node size and
   re-lay-out the whole net. Best-looking result and no displacement math, but
   it either overwrites the user's hand-tuned positions or forces layout to be
   display-only for the entire net. Could still be offered as an optional
   "re-layout with expanded view" action on top of the current approach.
3. **Force/overlap-removal displacement** — d3-force collision or ELK's
   overlap-removal (`sporeOverlap`). More organic motion, but iterative,
   order-sensitive, and effectively non-invertible for drag commits; also a
   worse fit for the current synchronous, derive-from-model rendering.
4. **True nested editing via subflows** (`extent: "parent"`,
   `expandParent`) — make children real, editable nodes whose positions write
   back to the subnet definition. This is the natural **next milestone** on
   top of the prototype: the id namespacing (`instanceId::elementId`) already
   gives an unambiguous mapping back to the subnet, but position write-back,
   arc editing, and "which instance's edit wins" semantics need product
   decisions.
5. **Drill-down only (status quo)** — `activeSubnetId` navigation already
   exists; it loses the parent context, which is precisely what FE-874 wants
   to keep.

## Known limitations / follow-ups

- **No animation**: expansion/collapse snaps. Since nodes are controlled,
  animating is a matter of interpolating displayed positions (or CSS
  transitions on node transforms) between the two displacement states.
- **Double-click side effects**: the double-click also selects the instance
  (opens the properties panel and triggers the recenter-on-panel-open
  behaviour), and React Flow's default `zoomOnDoubleClick` zooms when the
  gesture lands on the pane. Both should be suppressed/disabled for the final
  UX; an explicit expand/collapse affordance on the node (icon button) is
  worth considering alongside the gesture.
- **Read-only children**: elements inside the frame can't be selected, edited,
  dragged, or connected yet (guarded deliberately so no invalid mutations can
  occur). Editability is the next milestone (alternative 4).
- **Simulation state not projected**: token counts / firing states are not
  shown on expanded children (the engine flattens with its own id scoping; a
  mapping layer is needed).
- **Expansion state is ephemeral**: reset on net switch / drill-down; not
  persisted per user or document.
- **Inverse displacement uses the pre-drag stored position**: dragging a node
  _across_ an expanded frame's center axis lands it slightly off from the
  cursor; also snap-to-grid applies to displayed (not stored) coordinates
  while something is expanded.
- **Stale layout on concurrent subnet edits**: the ELK layout is computed at
  expand time; elements added to the subnet afterwards (e.g. by a
  collaborator) won't appear until re-expand. Recompute on subnet change if
  this matters.
- **Nested component instances** render as collapsed boxes inside the frame;
  recursive expansion needs path-based namespacing (`a::b::c`) — the id scheme
  extends naturally.
- **User docs** (`docs/`, read by the in-app AI assistant) intentionally not
  updated yet — the interaction is prototype-grade and may change. Must be
  done before shipping.
- Per the ticket's Linear thread, the **Visualizer** needs a follow-up ticket
  once this lands.

## Proposed next steps

1. **UX review of the prototype** (Storybook story): gesture, frame styling,
   displacement feel, whether the properties panel should open on expand.
2. **Productionize**: move displacement + frame-layout math into
   `petrinaut-core` (next to `layout/`), unit-test the shift/inverse
   round-trip and frame sizing, disable `zoomOnDoubleClick`, suppress
   select-on-expand, add an affordance + keyboard access, animate.
3. **Milestone 2 — edit in place**: make children real editable nodes writing
   back to the subnet definition (position commits per subnet, arc editing
   rules, multi-instance semantics).
4. **Milestone 3 — simulation overlay**: map engine's flattened ids back to
   `instanceId::elementId` so token counts and firing animations render inside
   expanded frames.
5. Update user docs + AI-assistant doc registry; create the Visualizer
   follow-up ticket.
