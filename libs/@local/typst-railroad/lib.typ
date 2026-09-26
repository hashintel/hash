#let railroad-wasm = plugin("dist/railroad_plugin.wasm")

#let __make() = {
  let seal(object) = (__diagram: object)
  let is-sealed(object) = "__diagram" in object
  let unseal(object) = {
    assert(is-sealed(object), message: "Object is not sealed")
    object.__diagram
  }

  let element(name, contents) = {
    let object = (:)
    object.insert(name, contents)

    seal(object)
  }

  let leaf(name) = seal(name)

  let convert(make: (:), object) = unseal(
    if type(object) == dictionary and is-sealed(object) {
      object
    } else if type(object) == array {
      (make.sequence)(..object)
    } else if type(object) == str {
      (make.terminal)(object)
    } else if type(object) == label {
      (make.non-terminal)(str(object))
    } else if type(object) == content {
      (make.comment)(object.text)
    } else {
      panic("Invalid child")
    },
  )

  let convert-arguments-unbound(make: (:), arguments) = {
    assert(
      arguments.named().len() == 0,
      message: "Children cannot have named arguments",
    )

    for argument in arguments.pos() {
      (convert(make: make, argument),)
    }
  }

  let terminal(label) = element("Terminal", (label: label))
  let non-terminal(label) = element("NonTerminal", (label: label))
  let comment(text) = element("Comment", (text: text))

  let label-unbound(make: (:), label, child) = if label != none {
    element("LabeledBox", (
      inner: convert(make: make, child),
      label: convert(make: make, label),
    ))
  } else {
    child
  }

  let sequence(label: none, ..children) = {
    let make = (
      terminal: terminal,
      non-terminal: non-terminal,
      comment: comment,
      sequence: sequence,
    )

    label-unbound(
      make: make,
      label,
      element("Sequence", (
        children: convert-arguments-unbound(
          make: make,
          children,
        ),
      )),
    )
  }

  let make = (
    terminal: terminal,
    non-terminal: non-terminal,
    comment: comment,
    sequence: sequence,
  )

  let convert-arguments = convert-arguments-unbound.with(make: make)
  let convert-argument = convert.with(make: make)
  let label-element = label-unbound.with(make: make)

  let labeled(label: none, child) = {
    assert(label != none, message: "Label cannot be none")

    element("LabeledBox", (
      inner: convert-argument(child),
      label: convert-argument(label),
    ))
  }

  let choice(label: none, ..children) = label-element(label, element("Choice", (
    children: convert-arguments(children),
  )))

  let empty = seal("Empty")
  let hgrid(label: none, ..children) = label-element(label, element(
    "HorizontalGrid",
    (
      children: convert-arguments(children),
    ),
  ))
  let vgrid(label: none, ..children) = label-element(label, element(
    "VerticalGrid",
    (
      children: convert-arguments(children),
    ),
  ))
  let link(label: none, child, url: none) = {
    assert(url != none, message: "URL cannot be none")

    label-element(label, element("Link", (
      inner: convert-argument(child),
      uri: url,
    )))
  }
  let optional(label: none, child) = label-element(label, element("Optional", (
    inner: convert-argument(child),
  )))
  let repeat(label: none, child, repeat: none) = {
    assert(repeat != none, message: "Repeat cannot be none")

    label-element(label, element("Repeat", (
      inner: convert-argument(child),
      repeat: convert-argument(repeat),
    )))
  }

  let stack(label: none, ..children) = label-element(label, element("Stack", (
    children: convert-arguments(children),
  )))

  let start(simple: true) = seal(if simple == true { "SimpleStart" } else {
    "Start"
  })
  let end(simple: true) = seal(if simple == true { "SimpleEnd" } else { "End" })

  let diagram(simple: true, ..children) = {
    (
      sequence(
        start(simple: simple),
        ..children,
        end(simple: simple),
      ),
    )
  }

  (
    terminal: terminal,
    non-terminal: non-terminal,
    comment: comment,
    sequence: sequence,
    labeled: labeled,
    choice: choice,
    empty: empty,
    hgrid: hgrid,
    vgrid: vgrid,
    link: link,
    optional: optional,
    repeat: repeat,
    stack: stack,
    start: start,
    end: end,
    diagram: diagram,
    unseal: unseal,
  )
}

#let (
  terminal,
  non-terminal,
  comment,
  sequence,
  labeled,
  choice,
  empty,
  hgrid,
  vgrid,
  link,
  optional,
  repeat,
  stack,
  start,
  end,
  diagram,
  unseal: __unseal,
) = __make()

#let seq = sequence;
#let opt = optional;
#let t = terminal;
#let nt = non-terminal;
#let c = comment;

#let diagram-style(body) = {
  ((css: body),)
}

#let diagram-fonts(..fonts) = {
  let fonts = for font in fonts.pos() {
    ("\"" + str(font) + "\"",)
  }

  let fonts = fonts.join(" , ")

  diagram-style("svg.railroad text.comment { font-family: " + fonts + "; }")
  diagram-style("svg.railroad text { font-family: " + fonts + "; }")
}

#let __accum-custom-css(body) = {
  let finished = ()
  let css = ()

  for fragment in body {
    if "css" in fragment {
      css.push(fragment.at("css"))
    } else {
      finished.push(__unseal(fragment))
    }
  }

  (finished, css.join("\n"))
}

#let __svg-element(node) = if type(node) == str {
  text(node)
} else {
  html.elem(node.tag, attrs: node.attrs, node.children.map(__svg-element).join())
}

#let svg(body) = {
  let nodes = if type(body) == array { body } else { (body,) }
  let diagram = json.encode((
    styles: (base: none, custom: none),
    diagram: nodes.map(__unseal),
  ))
  let compiled = railroad-wasm.compile_json(bytes(diagram))
  let (root,) = xml(compiled.slice(16))
  root.attrs.insert("width", str(int.from-bytes(compiled.slice(0, 8), endian: "big", signed: true)))
  root.attrs.insert("height", str(int.from-bytes(compiled.slice(8, 16), endian: "big", signed: true)))

  // pre is required, as otherwise HTML attributes are inserted into the SVG, breaking it.
  html.elem(
    "pre",
    attrs: (style: "display: contents; white-space: normal"),
    __svg-element(root),
  )
}

#let canvas(style: "Light", body) = {
  let body = if type(body) == array {
    body
  } else {
    (body,)
  }

  let (body, css) = __accum-custom-css(body)

  assert(
    style == "Light" or style == "Dark",
    message: "Base style must be either 'Light' or 'Dark'",
  )

  let styles = (base: style, custom: css)

  let diagram = json.encode((styles: styles, diagram: body))
  let compiled = railroad-wasm.compile_json(bytes(diagram))

  // Skip the big-endian i64 width and height before the SVG document.
  let contents = compiled.slice(16)

  image(contents, format: "svg")
}
