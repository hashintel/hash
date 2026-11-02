#let section-number(..numbers) = numbering("1.1", ..numbers.pos().slice(1))

#let note(body) = html.elem("aside", attrs: (class: "note", role: "note"))[
  *Note.* #body
]

#let incomplete(scope) = html.aside(class: "note", role: "note")[
  *Implementation status.* The behaviour specified in this #scope is not yet fully implemented.
]

#let proof(title, body) = html.div(class: "note proof")[
  #html.p[*Proof. #title*]
  #body
]

#let schematic(..parts) = html.elem(
  "pre",
  attrs: (class: "schematic-code", tabindex: "0", "aria-label": "Schematic code"),
  html.code(parts.pos().join()),
)

#let rule(identifier, body) = {
  let fragment = "rule-" + identifier
  html.div(id: fragment, class: "language-rule")[
    #html.p(class: "rule-label", link("#" + fragment, "[" + identifier + "]"))
    #body
  ]
}

#let term(key, form: none) = context {
  let vocabulary = query(<reference-vocabulary>)
  assert(vocabulary.len() == 1, message: "term needs the reference template")
  let entry = vocabulary.first().value.at(key, default: none)
  assert(entry != none, message: "unknown glossary term: " + key)
  [#metadata(key)<reference-term-use>#link(label("term-" + key), if form == none { entry.name } else { form })]
}

#let term-lists(vocabulary) = context {
  let entries = vocabulary.pairs().sorted(key: pair => lower(pair.at(1).name))
  if entries.len() == 0 { return }

  heading(level: 2, numbering: none)[Glossary]
  block(html.dl(class: "glossary", for (key, entry) in entries {
    [#html.dt(entry.name)#label("term-" + key)#html.dd(entry.definition)]
  }))

  // Only authored-body uses count, not copies in the contents or these lists.
  let uses = query(selector(<reference-term-use>).within(<reference-content>))
  let used-keys = uses.map(occurrence => occurrence.value)
  let indexed = entries.filter(pair => pair.at(0) in used-keys)
  if indexed.len() > 0 {
    heading(level: 2, numbering: none)[Index]
    block(html.dl(class: "term-index", for (key, entry) in indexed {
      let sections = ()
      let targets = ()
      for occurrence in uses.filter(occurrence => occurrence.value == key) {
        let preceding = query(selector(heading).within(<reference-content>).before(occurrence.location()))
        let section = if preceding.len() > 0 { preceding.last() } else { none }
        let destination = if section == none { none } else { section.location() }
        if destination not in sections {
          sections.push(destination)
          let caption = if section == none { [Opening text] } else {
            show link: linked => linked.body
            if section.numbering != none {
              numbering(section.numbering, ..counter(heading).at(destination))
              [ ]
            }
            section.body
          }
          targets.push(link(if destination == none { occurrence.location() } else { destination }, caption))
        }
      }
      html.dt(link(label("term-" + key), entry.name))
      html.dd(targets.join([, ]))
    }))
  }
}

#let template(
  body,
  title: "HashQL Reference",
  description: none,
  notice: none,
  home: none,
  links: (),
  vocabulary: (:),
) = {
  set document(title: title, description: description)
  set text(lang: "en", region: "GB")
  set heading(numbering: section-number)
  set raw(
    syntaxes: "syntax/hashql.sublime-syntax",
    theme: "syntax/reference.tmTheme",
    tab-size: 4,
  )

  show heading.where(level: 1): set heading(numbering: none, outlined: false)
  show heading: section => context {
    if section.level == 1 {
      html.header(class: "document-header")[
        #html.h1(section.body)
        #if description != none { html.p(class: "description", description) }
        #if notice != none { html.aside(class: "note", role: "note", notice) }
      ]
    } else {
      html.elem("h" + str(calc.min(section.level, 6)), link(section.location(), {
        show link: linked => linked.body
        if section.numbering != none {
          html.span(class: "section-number", counter(heading).display(section.numbering))
          " "
        }
        section.body
      }))
    }
  }

  show raw: code => {
    let is-hashql = code.lang == "hashql"
    let body = if is-hashql { code.lines.map(line => line.body).join("\n") } else { code.text }
    let attrs = if code.lang == none { (:) } else { ("data-lang": code.lang) }
    let content = html.elem("code", attrs: attrs, body)
    if code.block {
      html.elem(
        "pre",
        attrs: (tabindex: "0", "aria-label": if is-hashql { "HashQL specification example" } else { "Code block" }),
        content,
      )
    } else {
      content
    }
  }

  show table: content => html.elem(
    "div",
    attrs: (class: "table-scroll", tabindex: "0", role: "region", "aria-label": "Table"),
    content,
  )

  // HTML export omits equation numbers and descriptions from its MathML.
  show math.equation: equation => context {
    let attrs = if equation.block { (class: "equation-block", tabindex: "0") } else { (:) }
    if equation.alt != none {
      attrs.insert("role", "group")
      attrs.insert("aria-label", equation.alt)
    }

    if equation.block {
      let body = if equation.numbering == none { equation } else {
        html.div(class: "equation-numbered")[
          #equation
          #html.span(
            class: "equation-number",
            counter(math.equation).display(equation.numbering, at: equation.location()),
          )
        ]
      }
      block(html.elem("div", attrs: attrs, body))
    } else if equation.alt != none {
      html.elem("span", attrs: attrs, equation)
    } else {
      equation
    }
  }

  html.html(lang: "en")[
    #html.head[
      #html.meta(charset: "utf-8")
      #html.meta(name: "viewport", content: "width=device-width, initial-scale=1")
      #html.title(title)
      #if description != none { html.meta(name: "description", content: description) }
      #html.style(read("template.css") + "\n" + read("grammar.css"))
    ]
    #html.body[
      #html.a(class: "skip-link", href: "#main")[Skip to content]

      #context {
        let has-sections = query(heading.where(outlined: true)).len() > 0
        html.div(class: if has-sections { "reference-layout with-contents" } else { "reference-layout" })[
          #if has-sections {
            html.elem("aside", attrs: (class: "contents-wide", "aria-label": "Contents"))[
              #html.p(class: "contents-title", if home == none { [Contents] } else { link(home.href, home.label) })
              #outline(title: none)
            ]
            html.details(class: "contents-mobile")[
              #html.elem("summary")[Contents]
              #if home != none { html.p(class: "contents-title", link(home.href, home.label)) }
              #outline(title: none)
            ]
          }

          #html.elem("main", attrs: (id: "main", tabindex: "-1"))[
            #metadata(vocabulary)<reference-vocabulary>
            #block(body)<reference-content>
            #term-lists(vocabulary)
            #if links.len() > 0 {
              html.footer(class: "document-links", html.ul(for destination in links {
                html.li(link(destination.href, destination.label))
              }))
            }
          ]
        ]
      }
    ]
  ]
}
