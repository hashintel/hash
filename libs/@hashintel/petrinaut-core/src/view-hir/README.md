---
layer: core.view-hir
role: Lowers place visualizers (JavaScript with JSX) to a view tree over HIR expressions, checks what it draws, and interprets it into element values
---

# Petrinaut view HIR

A place visualizer is a JavaScript function body with JSX and ambient
`tokens`, `parameters`, `width`, and `height`. Legacy `Visualization(...)` modules also work, with TypeScript deprecation hints.
Both forms lower to the view HIR: a tree of elements, and of the conditionals and
comprehensions that choose or repeat them, whose every value is an
expression of the expression HIR (`../hir`) under the `visualizer` surface.
Nothing from a net runs as JavaScript; the editor interprets the tree for
each frame and turns the element values into React elements.

```text
visualizer code (JSX)
  -> lower-view.ts        JSX, ?:, && and .map become view nodes;
                          every other expression -> ../hir/lower-typescript.ts
  -> view-hir.ts
  -> check-view.ts        allowlists, attribute and child types, the root is
                          one Visualizer.Svg; expressions -> ../hir/typecheck.ts
  -> interpret-view.ts    element values; expressions -> ../hir/interpret.ts
  -> the editor's renderer
```

## Why a separate tree

The expression HIR is the one compiler for dynamics, lambdas, kernels,
metrics and scenario code, and its emitters produce buffer programs and
shaders. A picture needs elements, fragments, text children and a root that
draws; none of that can compile to a buffer, and carrying it in the
expression grammar would spread `element` cases through every pass and
emitter. The view HIR keeps those in one place and reuses the expression HIR
for what is genuinely shared: field reads, arithmetic, `Math.*`, `.map`,
`.filter`, `.slice`, template literals and `const` bindings.

The expression HIR still knows the `visualizer` surface, because the rules a
visualizer's expressions follow are expression-level: conditions are judged
by truthiness, `&&` and `||` return an operand, `+` joins text, an index
past the end reads as `null`. Those rules are gated on the surface in the
expression lowering, checker and interpreter, and apply to no other surface.

## Grammar

| Node      | Lowered from                                             |
| --------- | -------------------------------------------------------- |
| `element` | `<tag attr={…}>…</tag>`, `<>…</>` (tag `#fragment`)      |
| `text`    | literal JSX text, whitespace-cleaned as JSX compilers do |
| `expr`    | `{expression}` in child position, written as text        |
| `empty`   | `null`, `true`, `false` in child position                |
| `cond`    | `condition ? a : b`, or a guard `if` in a block body     |
| `and`     | `condition && a` (a falsy condition is the result)       |
| `map`     | `target.map((item, index?) => a)`                        |
| `let`     | `const` bindings of a block body                         |

The root is `ViewHir`: the props parameter (`({ tokens, parameters })`) and
the body. Bare bodies bind the same props without a source wrapper, keeping
diagnostic spans in the original code. `check-view.ts` requires every return
path to produce a single `Visualizer.Svg` element. This builtin root is distinct from SVG drawing elements. Native `svg` roots and nested SVGs remain accepted as deprecated compatibility syntax; nested `Visualizer.Svg` roots are rejected. The root tag identifies the renderer; additional visualizer types can define their own lowering and rendering rules without widening the SVG child allowlist.

## What a visualizer may draw

`view-elements.ts` holds the allowlists: SVG drawing, container, text and
paint-server elements; their geometry, paint and text attributes, `key`, and a `style` object of common properties. Images,
links, scripts, embedded content, event handlers and namespaced attributes
are refused by the lowering, and `url(...)` in a value is accepted only as a
fragment reference, `url(#marker)`. The renderer applies the same sets again
before anything reaches the DOM, since attribute values may be computed at
run time.

`visualizer-svg.ts` defines the SVG root properties and validates both literal and computed values. The editor supplies viewport dimensions when interpreting a frame, owns the actual SVG size, and keeps the optional scene camera outside the compiled view. Resizing does not trigger compilation.

## Main modules

| Module                        | Role                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| `view-hir.ts`                 | The view node grammar, the `ViewHir` root and tree walkers.             |
| `view-hir-schema.ts`          | Zod schema in lockstep with the grammar, for the worker boundary.       |
| `lower-view.ts`               | Lowers the module shape and JSX; delegates expressions to the HIR.      |
| `reject-typescript-syntax.ts` | Refuses annotations, casts and other TypeScript-only syntax.            |
| `check-view.ts`               | Allowlists, attribute and child types, the root element requirement.    |
| `interpret-view.ts`           | Evaluates a view into `ViewElementValue` trees for the renderer.        |
| `view-elements.ts`            | The elements, attributes and style properties a visualizer may draw.    |
| `visualizer.ts`               | Lowers and checks one visualizer; the worker's `sdcpn/lowerVisualizer`. |

`Visualizer.Svg` accepts `backgroundColor`, `origin`, `viewBox`, and `navigation`. An explicit viewBox and an origin are mutually exclusive. The editor fits fixed drawings proportionally and keeps a navigable scene's camera through frame and code updates.
