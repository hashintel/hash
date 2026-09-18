# HashQL specification

`main.typ` contains the specification. From this directory, build it with Typst 0.15.1:

```sh
typst compile --features html main.typ dist/main.html
```

Open `dist/main.html` in a browser. The file includes its stylesheet and needs no server. Typst's experimental HTML exporter reports a warning on each build.

For continuous compilation without starting a preview server:

```sh
typst watch --features html --no-serve main.typ dist/main.html
```

Reload the browser after an edit. To inspect the layout with longer text, compile the separate rendering specimen:

```sh
typst compile --features html specimen.typ dist/specimen.html
```

The specimen's sequence notation is synthetic and does not define HashQL.

## Writing

Keep `= HashQL` as the document title. Use `==` for sections, `===` for subsections and further levels as needed. The template numbers sections and generates the contents from their headings. Give a heading a label to make its fragment independent of its wording:

```typst
== Notation <notation>

The forms in @notation use the following conventions.
```

`@notation` becomes a numbered section link. The template renders ordinary Typst paragraphs, lists, raw code, quotations, tables and captioned figures. Use `table.header(...)` for a table's header cells. Long code and tables scroll within their own regions.

Import these helpers when needed:

```typst
#import "template.typ": note, rule

#rule("example.order")[A statement with a named fragment.]

#note[An explanatory note.]
```

A rule's fragment is `#rule-` followed by its identifier. Use `#link("#rule-example.order")[[example.order]]` to refer to the example above. Choose distinct identifiers within a document.

Write ordinary Typst math: `$x^2$` inline or `$ x^2 $` on its own line for a display equation. Typst exports it as MathML. A show rule gives display equations a focusable scroll region, without changing their notation or requiring a wrapper at each use. Use `#set math.equation(numbering: "(1)")` for numbered equations and ordinary labels for references. An authored description such as `#math.equation(alt: "x squared", $x^2$)` names the surrounding math group. Labels and numbered references for figures use Typst's native `figure` and `@label` syntax.

## Specification examples

Tag examples with `hashql` to highlight the specification notation:

````typst
```hashql
let minimum = 18 in
(value: Integer): Boolean -> value >= minimum
```
````

Typst applies the local `syntax/hashql.sublime-syntax` definition and `syntax/reference.tmTheme` palette during compilation. The resulting HTML contains highlighted text without a script or external stylesheet. Untagged code and other language tags remain monochrome. Inline examples can use `#raw("x as Integer", lang: "hashql")`.

The highlighting is lexical rather than a parser or type checker. It recognizes the notation's keywords, literals, paths, input prefixes and type-like names, with `//` for explanatory comments. Compiler-output excerpts retain their diagnostic identifiers, with highlighting for generated locals and type variables. These lexical categories do not establish program validity.

The notation chapter derives expression forms from [`hir/src/pretty.rs`](../hir/src/pretty.rs), aggregate delimiters from [`core/src/pretty/formatter.rs`](../core/src/pretty/formatter.rs), and type forms from [`core/src/type/pretty.rs`](../core/src/type/pretty.rs). `chapters/pseudo.typ` describes the simplifications used in specification examples. These forms do not define a new frontend.

## Glossary and index

Pass a `vocabulary` dictionary to the template and mark term uses with `term`. This example uses the specimen's synthetic sequence notation:

```typst
#import "template.typ": template, term

#show: template.with(vocabulary: (
  sequence: (
    name: "sequence",
    definition: [An ordered collection of symbols.],
  ),
))

= Example

== Sequences

A #term("sequence") preserves order. Two #term("sequence", form: [sequences]) can contain the same symbols.
```

The template appends a glossary containing every supplied definition, sorted by name without regard to case. Marked uses link to their definitions and generate a separate index of section links. Repeated uses in one section produce one index link. Copies in the contents, glossary and index do not count as uses.

`form` changes the displayed text without changing the term's identity. An unknown key fails compilation. Plain-text mentions are not indexed automatically, and definitions are never inferred from prose. An empty vocabulary produces neither list, and a vocabulary with no marked uses produces only the glossary.

## Fonts and styling

`template.css` uses locally installed KH Teka for text and headings, KH Teka Mono for code, and KH Giga for block quotations. System sans-serif, monospace and serif families provide fallbacks. The HTML does not load or include those font files. The browser renders equations from MathML.

The page stays light regardless of the browser's preferred color scheme. Browser printing removes navigation and wraps long code lines. Edit `template.css` to change the presentation, then rebuild the HTML.
