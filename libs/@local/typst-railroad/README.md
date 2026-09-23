# Railroad diagrams

Render structured syntax diagrams with the Rust [`railroad`](https://docs.rs/railroad/) crate in [Typst](https://typst.app/).

- [Building a diagram](#building-a-diagram) shows a complete example.
- [Rendering](#rendering) covers inline SVG and self-contained images.
- [Nodes](#nodes) lists the constructors and their arguments.
- [Building the library](#building-the-library) prepares the plugin for local use.

## Building a diagram

Compose a diagram from nodes, then pass it to a rendering function. This example draws a `let` binding with an optional initialiser:

```typst
#import "/libs/@local/typst-railroad/lib.typ" as rr

#rr.canvas(rr.diagram(
  "let",
  rr.non-terminal("identifier"),
  rr.optional(rr.sequence("=", rr.non-terminal("expression"))),
))
```

`diagram` adds start and end markers. Strings such as `"let"` become terminal nodes. Before compiling the example, [build the library](#building-the-library) and set Typst's `--root` to the repository root.

## Rendering

| Function                       | Output                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `svg(body)`                    | Inline SVG in an HTML document. Requires Typst's `--features html`. The surrounding document supplies the stylesheet. |
| `canvas(body, style: "Light")` | A self-contained SVG image for HTML or PDF output. The style defaults to `"Light"`. `"Dark"` is also available.       |

Both functions accept a node or an array of nodes. Multiple top-level nodes appear vertically, without connecting paths.

Use `svg` when the diagrams should share the page's CSS, as in the [HashQL grammar renderer](../hashql/docs/template/grammar.typ). Use `canvas` when the image should carry its own styling.

### Styling images

For `canvas`, concatenate styling fragments with the diagram array:

```typst
#import "/libs/@local/typst-railroad/lib.typ" as rr

#rr.canvas(
  style: "Dark",
  rr.diagram-fonts("monospace")
    + rr.diagram-style("svg.railroad text { font-size: 14px; }")
    + rr.diagram(rr.repeat(rr.non-terminal("item"), repeat: ",")),
)
```

`diagram-fonts(..fonts)` sets the SVG's font-family list. `diagram-style(css)` adds a CSS string after the base stylesheet. These fragments apply to `canvas`, not `svg`.

## Nodes

The signatures below omit the `rr.` prefix. `..children` accepts positional child nodes.

### Tokens and annotations

| Constructor           | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `terminal(label)`     | A literal token, such as `"let"` or `"+"`.          |
| `non-terminal(label)` | A named grammar production, such as `"expression"`. |
| `comment(text)`       | An explanatory text node.                           |

### Grammar structure

| Constructor                        | Meaning                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sequence(..children)`             | Connects children from left to right.                                                                                                                                                |
| `choice(..children)`               | Offers alternative paths through exactly one child.                                                                                                                                  |
| `optional(child)`                  | Adds a path that skips the child.                                                                                                                                                    |
| `repeat(child, repeat: separator)` | Adds a return path through `separator` for further repetitions of the child. A traversal must include the child at least once. Use `repeat: rr.empty` for an unlabelled return path. |
| `stack(..children)`                | Connects a sequence of children arranged from top to bottom.                                                                                                                         |

Each constructor in this group also accepts `label: none`. Supply a label node to enclose the result in a labelled box.

### Layout and decoration

| Constructor                    | Meaning                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `hgrid(..children)`            | Places unconnected children side by side.                               |
| `vgrid(..children)`            | Places unconnected children from top to bottom.                         |
| `labeled(child, label: label)` | Encloses a child in a labelled box. You must supply a non-`none` label. |
| `link(child, url: url)`        | Makes the child a link to the required URL string.                      |

`hgrid`, `vgrid` and `link` also accept `label: none` to add a labelled box.

### Boundaries and empty paths

| Item                                | Meaning                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `diagram(..children, simple: true)` | Returns an array containing a sequence with start and end markers.         |
| `start(simple: true)`               | A circle marking the start, or vertical bars with `simple: false`.         |
| `end(simple: true)`                 | A circle marking the end, or vertical bars with `simple: false`.           |
| `empty`                             | An empty node for an unlabelled path. Pass `rr.empty` without parentheses. |

### Shorthand

Child positions accept strings as terminals, arrays as sequences, Typst labels such as `<expression>` as non-terminals, and plain text content such as `[note]` as comments. These conversions also apply to a box's label node.

The aliases `t`, `nt`, `c`, `seq` and `opt` are equivalent to `terminal`, `non-terminal`, `comment`, `sequence` and `optional` respectively.

## Building the library

From the repository root:

```sh
mise exec -- turbo run build:wasm --filter=railroad-plugin
```

The [HashQL documentation build](../hashql/docs/README.md) performs this step automatically. Rebuild after changing the library's Rust source or dependencies.
