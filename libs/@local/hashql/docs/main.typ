#import "template/lib.typ": template

#let page(body, title: "HashQL Reference") = template(
  [
    = HashQL Reference
    #body
  ],
  title: title,
  description: "A functional, side-effect-free query language",
  notice: [
    This reference specifies the intended behaviour of HashQL, including planned functionality. The implementation may lag behind this specification or be incomplete.

    Content that has not yet been implemented is marked accordingly.
  ],
  home: (label: "HashQL Reference", href: <reference-home>),
  links: ((label: "GitHub", href: "https://github.com/hashintel/hash"),),
)

#document("index.html", page[
  - #link(<pseudo-syntax>)[Specification syntax]
  - #link(<iteration>)[Iteration]
  - #link(<references>)[References]
]) <reference-home>

#document("syntax.html", page(
  include "chapters/pseudo.typ",
  title: "Specification syntax | HashQL Reference",
))

#document("iteration.html", page(
  include "chapters/iteration.typ",
  title: "Iteration | HashQL Reference",
))

#document("references.html", page(
  [
    #heading(level: 2, numbering: none)[References] <references>
    #bibliography("references.yml", title: none, style: "ieee", full: true)
  ],
  title: "References | HashQL Reference",
))
