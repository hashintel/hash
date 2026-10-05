// Linked ABNF productions and railroad diagrams share one parsed right-hand side.
#import "/libs/@local/typst-railroad/lib.typ" as rr

// Finite repetition uses optional copies rather than the loop the plugin reserves for unbounded repetition.
#let bounded-extra-node(atom, extra) = if extra <= 0 {
  rr.empty
} else {
  rr.optional(rr.sequence(atom, bounded-extra-node(atom, extra - 1)))
}

// Tokens retain separating whitespace because ABNF concatenation requires it.

#let digit-run-pattern(base) = if base == "b" {
  "[01]+"
} else if base == "d" {
  "[0-9]+"
} else {
  "[0-9A-Fa-f]+"
}

#let tokenize(src) = {
  let toks = ()
  let i = 0
  let n = src.len()
  while true {
    let ws-seen = false
    while i < n {
      let rest = src.slice(i)
      let ws = rest.match(regex("^(?:[ \t]|(?:;[\t -~]*)?\r\n[ \t])+"))
      if ws != none {
        i += ws.end
        ws-seen = true
        continue
      }
      let final-comment = rest.match(regex("^;[\t -~]*(?:\r\n)?$"))
      if final-comment != none or rest == "\r\n" {
        i = n
        break
      }
      assert(
        not (src.at(i) in (";", "\r", "\n")),
        message: "grammar(): an ABNF continuation requires CRLF and leading space or tab at byte " + str(i),
      )
      break
    }
    if i >= n {
      toks.push((kind: "eof", ws: ws-seen))
      break
    }
    let rest = src.slice(i)
    let ch = src.at(i)
    if ch == "\"" {
      let m = rest.match(regex("^\"[ -!#-~]*\""))
      assert(m != none, message: "grammar(): invalid or unterminated ASCII quoted string at byte " + str(i))
      toks.push((
        kind: "string",
        prefix: "",
        sensitive: false,
        text: m.text.slice(1, m.text.len() - 1),
        ws: ws-seen,
      ))
      i += m.end
    } else if ch == "<" {
      let m = rest.match(regex("^<[ -=?-~]*>"))
      assert(m != none, message: "grammar(): invalid or unterminated ASCII prose value at byte " + str(i))
      toks.push((kind: "prose", text: m.text.slice(1, m.text.len() - 1), ws: ws-seen))
      i += m.end
    } else if ch == "(" {
      toks.push((kind: "lparen", ws: ws-seen))
      i += 1
    } else if ch == ")" {
      toks.push((kind: "rparen", ws: ws-seen))
      i += 1
    } else if ch == "[" {
      toks.push((kind: "lbracket", ws: ws-seen))
      i += 1
    } else if ch == "]" {
      toks.push((kind: "rbracket", ws: ws-seen))
      i += 1
    } else if ch == "/" {
      toks.push((kind: "slash", ws: ws-seen))
      i += 1
    } else if ch == "*" {
      toks.push((kind: "star", ws: ws-seen))
      i += 1
    } else if ch == "%" {
      assert(i + 1 < n, message: "grammar(): incomplete '%' construct at byte " + str(i))
      let tag = lower(src.at(i + 1))
      if tag == "s" or tag == "i" {
        assert(
          i + 2 < n and src.at(i + 2) == "\"",
          message: "grammar(): expected a quoted string after '%" + tag + "' at byte " + str(i),
        )
        let after = src.slice(i + 2)
        let m = after.match(regex("^\"[ -!#-~]*\""))
        assert(m != none, message: "grammar(): invalid or unterminated ASCII quoted string at byte " + str(i + 2))
        toks.push((
          kind: "string",
          prefix: "%" + src.at(i + 1),
          sensitive: tag == "s",
          text: m.text.slice(1, m.text.len() - 1),
          ws: ws-seen,
        ))
        i = i + 2 + m.end
      } else if tag == "b" or tag == "d" or tag == "x" {
        let base = tag
        let pat = digit-run-pattern(base)
        let after = src.slice(i + 2)
        let m0 = after.match(regex("^" + pat))
        assert(m0 != none, message: "grammar(): malformed numeric terminal at byte " + str(i))
        let first = m0.text
        let pos = i + 2 + m0.end
        let parts = (first,)
        while true {
          let rest2 = src.slice(pos)
          let md = rest2.match(regex("^\\." + pat))
          if md == none { break }
          parts.push(md.text.slice(1))
          pos += md.end
        }
        if parts.len() > 1 {
          toks.push((kind: "numeric", base: base, form: "seq", parts: parts, ws: ws-seen))
          i = pos
        } else {
          let rest2 = src.slice(pos)
          let mr = rest2.match(regex("^-" + pat))
          if mr != none {
            toks.push((
              kind: "numeric",
              base: base,
              form: "range",
              low: first,
              high: mr.text.slice(1),
              ws: ws-seen,
            ))
            i = pos + mr.end
          } else {
            toks.push((kind: "numeric", base: base, form: "single", value: first, ws: ws-seen))
            i = pos
          }
        }
      } else {
        assert(
          false,
          message: "grammar(): unsupported '%" + tag + "' construct at byte " + str(i)
            + " (only %s, %i, %b, %d, %x are implemented)",
        )
      }
    } else {
      let dm = rest.match(regex("^[0-9]+"))
      if dm != none {
        toks.push((kind: "digits", text: dm.text, ws: ws-seen))
        i += dm.end
      } else {
        let idm = rest.match(regex("^[A-Za-z][A-Za-z0-9-]*"))
        assert(
          idm != none,
          message: "grammar(): unexpected character '" + ch + "' at byte " + str(i),
        )
        toks.push((kind: "ident", text: idm.text, ws: ws-seen))
        i += idm.end
      }
    }
  }
  toks
}

// Self-recursion keeps the precedence levels in one dispatcher without forward name references.

#let element-start-kinds = ("ident", "string", "numeric", "prose", "lparen", "lbracket", "digits", "star")

#let parse-expr(toks, i, level) = {
  if level == "alt" {
    let (node, j) = parse-expr(toks, i, "concat")
    let items = (node,)
    let k = j
    while toks.at(k).kind == "slash" {
      k += 1
      let (n2, k2) = parse-expr(toks, k, "concat")
      items.push(n2)
      k = k2
    }
    if items.len() == 1 {
      (items.at(0), k)
    } else {
      ((kind: "alt", items: items), k)
    }
  } else if level == "concat" {
    let (first, j) = parse-expr(toks, i, "repetition")
    let items = (first,)
    let k = j
    while toks.at(k).kind in element-start-kinds {
      assert(
        toks.at(k).ws,
        message: "grammar(): concatenated elements require separating ABNF whitespace at token " + str(k),
      )
      let (n2, k2) = parse-expr(toks, k, "repetition")
      items.push(n2)
      k = k2
    }
    if items.len() == 1 {
      (items.at(0), k)
    } else {
      ((kind: "seq", items: items), k)
    }
  } else if level == "repetition" {
    let k = i
    let t = toks.at(k)
    let spec = none
    let min = 1
    let max = 1
    if t.kind == "digits" {
      let k1 = k + 1
      let t1 = toks.at(k1)
      if t1.kind == "star" and not t1.ws {
        let k2 = k1 + 1
        let t2 = toks.at(k2)
        if t2.kind == "digits" and not t2.ws {
          min = int(t.text)
          max = int(t2.text)
          spec = t.text + "*" + t2.text
          k = k2 + 1
        } else {
          min = int(t.text)
          max = none
          spec = t.text + "*"
          k = k1 + 1
        }
      } else {
        min = int(t.text)
        max = int(t.text)
        spec = t.text
        k = k1
      }
    } else if t.kind == "star" {
      let k1 = k + 1
      let t1 = toks.at(k1)
      if t1.kind == "digits" and not t1.ws {
        min = 0
        max = int(t1.text)
        spec = "*" + t1.text
        k = k1 + 1
      } else {
        min = 0
        max = none
        spec = "*"
        k = k1
      }
    }
    if spec != none and max != none {
      assert(
        max >= min,
        message: "grammar(): repetition upper bound " + str(max) + " is below its lower bound " + str(min)
          + " at token " + str(i),
      )
    }
    if spec != none {
      assert(
        not toks.at(k).ws,
        message: "grammar(): repetition prefix must adjoin its element at token " + str(k),
      )
    }
    let (atom, k2) = parse-expr(toks, k, "element")
    if spec == none {
      (atom, k2)
    } else {
      ((kind: "repeat", min: min, max: max, spec: spec, atom: atom), k2)
    }
  } else {
    let t = toks.at(i)
    if t.kind == "ident" {
      ((kind: "nonterminal", name: t.text), i + 1)
    } else if t.kind == "string" {
      ((kind: "string", prefix: t.prefix, sensitive: t.sensitive, text: t.text), i + 1)
    } else if t.kind == "numeric" {
      let node = if t.form == "single" {
        (kind: "numeric", base: t.base, form: "single", value: t.value)
      } else if t.form == "seq" {
        (kind: "numeric", base: t.base, form: "seq", parts: t.parts)
      } else {
        (kind: "numeric", base: t.base, form: "range", low: t.low, high: t.high)
      }
      (node, i + 1)
    } else if t.kind == "prose" {
      ((kind: "prose", text: t.text), i + 1)
    } else if t.kind == "lparen" {
      let (inner, j) = parse-expr(toks, i + 1, "alt")
      assert(toks.at(j).kind == "rparen", message: "grammar(): expected closing ')' at token " + str(j))
      ((kind: "group", inner: inner), j + 1)
    } else if t.kind == "lbracket" {
      let (inner, j) = parse-expr(toks, i + 1, "alt")
      assert(toks.at(j).kind == "rbracket", message: "grammar(): expected closing ']' at token " + str(j))
      ((kind: "option", inner: inner), j + 1)
    } else {
      assert(
        false,
        message: "grammar(): expected a rule name, quoted string, numeric value, prose value, '(', or '[', found "
          + t.kind + " at token " + str(i),
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
    message: "grammar(): unexpected trailing input after a complete production, at token " + str(j),
  )
  node
}

#let collect-nonterminals(ast) = {
  if ast.kind == "nonterminal" {
    (ast.name,)
  } else if ast.kind == "string" or ast.kind == "numeric" or ast.kind == "prose" {
    ()
  } else if ast.kind == "group" or ast.kind == "option" {
    collect-nonterminals(ast.inner)
  } else if ast.kind == "repeat" {
    collect-nonterminals(ast.atom)
  } else {
    ast.items.map(collect-nonterminals).fold((), (a, b) => a + b)
  }
}

#let numeric-spelling(ast) = {
  if ast.form == "single" {
    "%" + ast.base + ast.value
  } else if ast.form == "seq" {
    "%" + ast.base + ast.parts.join(".")
  } else {
    "%" + ast.base + ast.low + "-" + ast.high
  }
}

#let string-spelling(ast) = ast.prefix + "\"" + ast.text + "\""

#let diagram-node(ast) = {
  if ast.kind == "nonterminal" {
    rr.non-terminal(ast.name)
  } else if ast.kind == "string" {
    if ast.text == "" {
      // An empty literal denotes the empty path.
      rr.empty
    } else {
      rr.terminal(string-spelling(ast))
    }
  } else if ast.kind == "numeric" {
    rr.terminal(numeric-spelling(ast))
  } else if ast.kind == "prose" {
    rr.comment("<" + ast.text + ">")
  } else if ast.kind == "group" {
    diagram-node(ast.inner)
  } else if ast.kind == "option" {
    rr.optional(diagram-node(ast.inner))
  } else if ast.kind == "repeat" {
    let atom = diagram-node(ast.atom)
    if ast.max == none {
      if ast.min == 0 {
        rr.optional(rr.repeat(atom, repeat: rr.empty))
      } else {
        let mandatory = range(ast.min - 1).map(_ => atom)
        if mandatory.len() == 0 {
          rr.repeat(atom, repeat: rr.empty)
        } else {
          rr.sequence(..mandatory, rr.repeat(atom, repeat: rr.empty))
        }
      }
    } else if ast.max == 0 {
      rr.empty
    } else {
      let mandatory = range(ast.min).map(_ => atom)
      let extra = ast.max - ast.min
      if extra == 0 {
        rr.sequence(..mandatory)
      } else if mandatory.len() == 0 {
        bounded-extra-node(atom, extra)
      } else {
        rr.sequence(..mandatory, bounded-extra-node(atom, extra))
      }
    }
  } else if ast.kind == "seq" {
    rr.sequence(..ast.items.map(diagram-node))
  } else {
    rr.choice(..ast.items.map(diagram-node))
  }
}

#let normalize(name) = lower(name)

#let render-text(ast) = {
  if ast.kind == "nonterminal" {
    link(
      "#grammar-" + normalize(ast.name),
      html.elem("span", attrs: (class: "grammar-nonterm"), ast.name),
    )
  } else if ast.kind == "string" {
    let cls = if ast.sensitive { "grammar-term" } else { "grammar-term-ci" }
    html.elem("code", attrs: (class: cls), string-spelling(ast))
  } else if ast.kind == "numeric" {
    let cls = if ast.form == "range" { "grammar-term-range" } else { "grammar-term" }
    html.elem("code", attrs: (class: cls), numeric-spelling(ast))
  } else if ast.kind == "prose" {
    html.elem("span", attrs: (class: "grammar-prose"), "<" + ast.text + ">")
  } else if ast.kind == "group" {
    [#html.elem("span", attrs: (class: "grammar-op"))[(]#render-text(
        ast.inner,
      )#html.elem("span", attrs: (class: "grammar-op"))[)]]
  } else if ast.kind == "option" {
    [#html.elem("span", attrs: (class: "grammar-op"))[\[]#render-text(
        ast.inner,
      )#html.elem("span", attrs: (class: "grammar-op"))[\]]]
  } else if ast.kind == "repeat" {
    [#html.elem("span", attrs: (class: "grammar-repeat"))[#ast.spec]#render-text(ast.atom)]
  } else if ast.kind == "seq" {
    ast.items.map(render-text).join([ ])
  } else {
    ast.items.map(render-text).join(
      [ #html.elem("span", attrs: (class: "grammar-op"))[/] ],
    )
  }
}

#let render-diagram(name, ast) = {
  let picture = rr.svg(rr.diagram(diagram-node(ast)))
  html.elem(
    "div",
    attrs: (
      class: "grammar-diagram-scroll",
      tabindex: "0",
      role: "region",
      "aria-label": "Railroad diagram for " + name,
      "aria-describedby": "grammar-text-" + name,
    ),
    // The linked text supplies the accessible equivalent of the diagram.
    html.elem(
      "div",
      attrs: ("aria-hidden": "true"),
      picture,
    ),
  )
}

#let render-production(name, ast) = {
  let anchor = "grammar-" + normalize(name)
  html.div(
    id: anchor,
    class: "grammar-rule",
    [
      #html.elem(
        "p",
        attrs: (
          id: "grammar-text-" + name,
          class: "grammar-body",
          tabindex: "0",
          role: "region",
          "aria-label": "Grammar production for " + name,
        ),
      )[#html.elem("span", attrs: (class: "grammar-head"))[
          #html.elem("code", attrs: (class: "grammar-name"), link("#" + anchor, name)) #html.elem(
            "span",
            attrs: (class: "grammar-op"),
          )[=]
        ] #html.elem("code", attrs: (class: "grammar-rhs"), render-text(ast))]
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
  let canonical = (:)
  for key in definitions.keys() {
    assert(
      key.match(regex("^[A-Za-z][A-Za-z0-9-]*$")) != none,
      message: "grammar(): invalid ABNF rule name '" + key + "'",
    )
    let norm = normalize(key)
    if norm in canonical {
      assert(
        false,
        message: "grammar(): ambiguous case-colliding definitions '" + canonical.at(norm) + "' and '" + key + "'",
      )
    }
    canonical.insert(norm, key)
  }
  let known = canonical.keys() + tokens.map(normalize)
  for name in names {
    let norm = normalize(name)
    assert(norm in canonical, message: "grammar(): no definition for production '" + name + "'")
    let rhs = definitions.at(canonical.at(norm))
    let ast = parse-rhs(rhs)
    for ref in collect-nonterminals(ast) {
      assert(
        normalize(ref) in known,
        message: "grammar(): unknown reference '" + ref + "' in production '" + name + "'",
      )
    }
    render-production(name, ast)
  }
}
