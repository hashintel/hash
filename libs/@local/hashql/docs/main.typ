#import "template/lib.typ": template

#show: it => template(
  it,
  title: "HashQL",
  description: "A functional, side-effect free query language",
  links: ((label: "GitHub", href: "https://github.com/hashintel/hash"),),
)

= HashQL

#include "chapters/pseudo.typ"
#include "chapters/iteration.typ"

#heading(level: 2, numbering: none)[References] <references>
#bibliography("references.yml", title: none, style: "ieee", full: true)
