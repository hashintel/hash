// Linked EBNF and railroad diagrams share a parsed production tree.
// Diagram colors are baked into SVG; keep them aligned with the reference palette.
#let grammar-ink = rgb("#252a31")
#let grammar-link = rgb("#285fa0")

#let diagram-font = ("KH Teka Mono", "DejaVu Sans Mono")
#let diagram-font-size = 11pt
#let box-height = 22pt
#let box-pad-x = 8pt
#let stub-length = 12pt
#let row-gap = 10pt
#let seq-gap = 14pt
#let branch-indent = 20pt
#let loop-drop = 18pt
#let arrow-half = 3.5pt
#let diagram-margin = 6pt

#let rail-stroke = 1pt + grammar-ink
#let box-stroke = 1pt + grammar-ink

#let hline(x0, y, x1, stroke: rail-stroke) = place(
  top + left,
  dx: x0,
  dy: y,
  line(end: (x1 - x0, 0pt), stroke: stroke),
)

#let vline(x, y0, y1, stroke: rail-stroke) = place(
  top + left,
  dx: x,
  dy: y0,
  line(end: (0pt, y1 - y0), stroke: stroke),
)

#let bend(x0, y0, x1, y1, stroke: rail-stroke) = place(
  top + left,
  dx: x0,
  dy: y0,
  curve(
    curve.move((0pt, 0pt)),
    curve.cubic(
      ((x1 - x0) / 2, 0pt),
      ((x1 - x0) / 2, y1 - y0),
      (x1 - x0, y1 - y0),
    ),
    stroke: stroke,
  ),
)

#let arrow-left(cx, cy) = place(
  top + left,
  dx: cx,
  dy: cy,
  polygon(
    fill: grammar-ink,
    (-arrow-half * 1.6, 0pt),
    (0pt, -arrow-half),
    (0pt, arrow-half),
  ),
)

#let leaf-box(label-body, shape-radius, text-fill) = {
  let sz = measure(text(font: diagram-font, size: diagram-font-size, label-body))
  let box-w = sz.width + 2 * box-pad-x
  let total-w = box-w + 2 * stub-length
  let h = calc.max(box-height, sz.height + 6pt)
  let entry = h / 2
  (
    width: total-w,
    height: h,
    entry: entry,
    draw: (x0, y0) => {
      hline(x0, y0 + entry, x0 + stub-length)
      place(
        top + left,
        dx: x0 + stub-length,
        dy: y0,
        rect(
          width: box-w,
          height: h,
          radius: shape-radius,
          stroke: box-stroke,
          fill: white,
          align(center + horizon, text(font: diagram-font, size: diagram-font-size, fill: text-fill, label-body)),
        ),
      )
      hline(x0 + stub-length + box-w, y0 + entry, x0 + total-w)
    },
  )
}

#let terminal-node(literal-text) = leaf-box(literal-text, box-height / 2, grammar-ink)

#let nonterminal-node(name) = {
  let sz = measure(text(font: diagram-font, size: diagram-font-size, name))
  let box-w = sz.width + 2 * box-pad-x
  let total-w = box-w + 2 * stub-length
  let h = calc.max(box-height, sz.height + 6pt)
  let entry = h / 2
  (
    width: total-w,
    height: h,
    entry: entry,
    draw: (x0, y0) => {
      hline(x0, y0 + entry, x0 + stub-length)
      place(
        top + left,
        dx: x0 + stub-length,
        dy: y0,
        rect(
          width: box-w,
          height: h,
          stroke: box-stroke,
          fill: white,
          align(
            center + horizon,
            link("#grammar-" + name, text(font: diagram-font, size: diagram-font-size, fill: grammar-link, name)),
          ),
        ),
      )
      hline(x0 + stub-length + box-w, y0 + entry, x0 + total-w)
    },
  )
}

#let empty-node(width: seq-gap) = (
  width: width,
  height: 0pt,
  entry: 0pt,
  draw: (x0, y0) => hline(x0, y0, x0 + width),
)

#let seq-node(children) = {
  let above = children.map(c => c.entry).fold(0pt, calc.max)
  let below = children.map(c => c.height - c.entry).fold(0pt, calc.max)
  let total-w = (
    children.map(c => c.width).fold(0pt, (a, b) => a + b)
      + seq-gap * calc.max(0, children.len() - 1)
  )
  (
    width: total-w,
    height: above + below,
    entry: above,
    draw: (x0, y0) => {
      let cursor = x0
      for (idx, c) in children.enumerate() {
        let cy = y0 + above - c.entry
        (c.draw)(cursor, cy)
        cursor += c.width
        if idx < children.len() - 1 {
          hline(cursor, y0 + above, cursor + seq-gap)
          cursor += seq-gap
        }
      }
    },
  )
}

#let choice-node(children) = {
  let n = children.len()
  let normal = children.at(0)
  let max-w = children.map(c => c.width).fold(0pt, calc.max)
  let total-w = 2 * branch-indent + max-w
  let row-tops = ()
  let acc = 0pt
  for (idx, c) in children.enumerate() {
    row-tops.push(acc)
    acc += c.height
    if idx < n - 1 { acc += row-gap }
  }
  let total-h = acc
  let entry = normal.entry
  (
    width: total-w,
    height: total-h,
    entry: entry,
    draw: (x0, y0) => {
      let spine-y = y0 + entry
      let inner-x0 = x0 + branch-indent
      let target-right = inner-x0 + max-w
      for (idx, c) in children.enumerate() {
        let row-y = y0 + row-tops.at(idx)
        let row-entry-y = row-y + c.entry
        if idx == 0 {
          hline(x0, spine-y, inner-x0)
        } else {
          bend(x0, spine-y, inner-x0, row-entry-y)
        }
        (c.draw)(inner-x0, row-y)
        let child-right = inner-x0 + c.width
        if child-right < target-right {
          hline(child-right, row-entry-y, target-right)
        }
        if idx == 0 {
          hline(target-right, row-entry-y, x0 + total-w)
        } else {
          bend(target-right, row-entry-y, x0 + total-w, spine-y)
        }
      }
    },
  )
}

#let optional-node(atom) = choice-node((empty-node(), atom))

#let repeat-node(atom) = {
  let w = atom.width
  let total-h = atom.height + loop-drop
  (
    width: w,
    height: total-h,
    entry: atom.entry,
    draw: (x0, y0) => {
      (atom.draw)(x0, y0)
      let entry-y = y0 + atom.entry
      let loop-y = y0 + atom.height + loop-drop
      vline(x0 + w, entry-y, loop-y)
      hline(x0, loop-y, x0 + w)
      arrow-left(x0 + w / 2, loop-y)
      vline(x0, loop-y, entry-y)
    },
  )
}

#let zero-or-more-node(atom) = optional-node(repeat-node(atom))

#let tokenize(src) = {
  let toks = ()
  let i = 0
  let n = src.len()
  while i < n {
    let rest = src.slice(i)
    let ws = rest.match(regex("^[ \t\r\n]+"))
    if ws != none {
      i += ws.end
      continue
    }
    let ch = src.at(i)
    if ch == "`" {
      let close = src.slice(i + 1).match(regex("^[^`]*`"))
      assert(close != none, message: "grammar(): unterminated terminal literal at byte " + str(i))
      let txt = src.slice(i + 1, i + 1 + close.end - 1)
      toks.push((kind: "terminal", text: txt))
      i = i + 1 + close.end
    } else if ch == "(" {
      toks.push((kind: "lparen"))
      i += 1
    } else if ch == ")" {
      toks.push((kind: "rparen"))
      i += 1
    } else if ch == "|" {
      toks.push((kind: "pipe"))
      i += 1
    } else if ch == "?" {
      toks.push((kind: "question"))
      i += 1
    } else if ch == "*" {
      toks.push((kind: "star"))
      i += 1
    } else if ch == "+" {
      toks.push((kind: "plus"))
      i += 1
    } else {
      let idm = rest.match(regex("^[A-Za-z_][A-Za-z0-9_]*"))
      assert(
        idm != none,
        message: "grammar(): unexpected character '" + ch + "' at byte " + str(i),
      )
      toks.push((kind: "ident", text: idm.text))
      i += idm.end
    }
  }
  toks.push((kind: "eof"))
  toks
}

#let parse-expr(toks, i, level) = {
  if level == "alt" {
    let (node, j) = parse-expr(toks, i, "seq")
    let items = (node,)
    let k = j
    while toks.at(k).kind == "pipe" {
      k += 1
      let (n2, k2) = parse-expr(toks, k, "seq")
      items.push(n2)
      k = k2
    }
    ((kind: "alt", items: items), k)
  } else if level == "seq" {
    let items = ()
    let k = i
    while toks.at(k).kind in ("ident", "terminal", "lparen") {
      let (n2, k2) = parse-expr(toks, k, "postfix")
      items.push(n2)
      k = k2
    }
    assert(items.len() > 0, message: "grammar(): empty alternative is not allowed (use a group with '?' to express an empty path)")
    ((kind: "seq", items: items), k)
  } else if level == "postfix" {
    let (atom, j) = parse-expr(toks, i, "atom")
    let kd = toks.at(j).kind
    if kd == "question" or kd == "star" or kd == "plus" {
      ((kind: "postfix", atom: atom, op: kd), j + 1)
    } else {
      ((kind: "postfix", atom: atom, op: none), j)
    }
  } else {
    let t = toks.at(i)
    if t.kind == "ident" {
      ((kind: "nonterminal", name: t.text), i + 1)
    } else if t.kind == "terminal" {
      ((kind: "terminal", text: t.text), i + 1)
    } else if t.kind == "lparen" {
      let (inner, j) = parse-expr(toks, i + 1, "alt")
      assert(
        toks.at(j).kind == "rparen",
        message: "grammar(): expected closing ')'",
      )
      ((kind: "group", inner: inner), j + 1)
    } else {
      assert(
        false,
        message: "grammar(): expected an identifier, a terminal literal, or '(', found "
          + t.kind,
      )
      (none, i)
    }
  }
}

#let parse-rhs(src) = {
  let toks = tokenize(src)
  let (node, j) = parse-expr(toks, 0, "alt")
  assert(
    toks.at(j).kind == "eof",
    message: "grammar(): unexpected trailing input after a complete production",
  )
  node
}

#let collect-nonterminals(ast) = {
  if ast.kind == "terminal" {
    ()
  } else if ast.kind == "nonterminal" {
    (ast.name,)
  } else if ast.kind == "group" {
    collect-nonterminals(ast.inner)
  } else if ast.kind == "postfix" {
    collect-nonterminals(ast.atom)
  } else {
    ast.items.map(collect-nonterminals).fold((), (a, b) => a + b)
  }
}

#let layout-node(ast) = {
  if ast.kind == "terminal" {
    terminal-node(ast.text)
  } else if ast.kind == "nonterminal" {
    nonterminal-node(ast.name)
  } else if ast.kind == "group" {
    layout-node(ast.inner)
  } else if ast.kind == "postfix" {
    let base = layout-node(ast.atom)
    if ast.op == none {
      base
    } else if ast.op == "question" {
      optional-node(base)
    } else if ast.op == "star" {
      zero-or-more-node(base)
    } else {
      repeat-node(base)
    }
  } else if ast.kind == "seq" {
    seq-node(ast.items.map(layout-node))
  } else {
    if ast.items.len() == 1 {
      layout-node(ast.items.at(0))
    } else {
      choice-node(ast.items.map(layout-node))
    }
  }
}

#let op-symbol(op) = if op == "question" { "?" } else if op == "star" { "*" } else { "+" }

#let render-text(ast) = {
  if ast.kind == "terminal" {
    html.elem("code", attrs: (class: "grammar-term"), ast.text)
  } else if ast.kind == "nonterminal" {
    link(
      "#grammar-" + ast.name,
      html.elem("span", attrs: (class: "grammar-nonterm"), ast.name),
    )
  } else if ast.kind == "group" {
    [#html.elem("span", attrs: (class: "grammar-op"))[(]#render-text(
        ast.inner,
      )#html.elem("span", attrs: (class: "grammar-op"))[)]]
  } else if ast.kind == "postfix" {
    let base = render-text(ast.atom)
    if ast.op == none {
      base
    } else {
      [#base#html.elem("span", attrs: (class: "grammar-op"))[#op-symbol(ast.op)]]
    }
  } else if ast.kind == "seq" {
    ast.items.map(render-text).join([ ])
  } else {
    ast.items.map(render-text).join(
      [ #html.elem("span", attrs: (class: "grammar-op"))[|] ],
    )
  }
}

#let render-diagram(name, ast) = context {
  let tree = layout-node(ast)
  let w = tree.width + 2 * diagram-margin
  let h = tree.height + 2 * diagram-margin
  html.elem(
    "div",
    attrs: (
      class: "grammar-diagram-scroll",
      tabindex: "0",
      role: "region",
      "aria-label": "Railroad diagram for " + name,
    ),
    html.frame(box(width: w, height: h, (tree.draw)(diagram-margin, diagram-margin))),
  )
}

#let render-production(name, ast) = {
  let anchor = "grammar-" + name
  html.div(
    id: anchor,
    class: "grammar-rule",
    [
      #html.p(
        class: "grammar-body",
      )[#html.elem("code", attrs: (class: "grammar-name"), link("#" + anchor, name)) #html.elem(
          "span",
          attrs: (class: "grammar-op"),
        )[::=] #render-text(ast)]
      #html.details(
        class: "grammar-diagram",
        [
          #html.elem("summary")[Railroad diagram]
          #render-diagram(name, ast)
        ],
      )
    ],
  )
}

#let grammar(definitions, names, tokens: ()) = {
  let known = definitions.keys() + tokens
  for name in names {
    let rhs = definitions.at(name, default: none)
    assert(rhs != none, message: "grammar(): no definition for production '" + name + "'")
    let ast = parse-rhs(rhs)
    for ref in collect-nonterminals(ast) {
      assert(
        ref in known,
        message: "grammar(): unknown reference '" + ref + "' in production '" + name + "'",
      )
    }
    render-production(name, ast)
  }
}
