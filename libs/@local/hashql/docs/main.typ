#import "template.typ": template

#show: it => template(
  it,
  title: "HashQL",
  description: "A functional, side-effect free query language",
  links: ((label: "GitHub", href: "https://github.com/hashintel/hash"),),
)

= HashQL

#include "chapters/pseudo.typ"
