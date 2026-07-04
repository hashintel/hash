# Petrinaut DSL — design sketch

A domain-specific language for Petrinaut user code (dynamics, lambdas,
kernels, metrics, scenario expressions), designed to **lower to the same HIR
as TypeScript** ([README](./README.md)). Users could switch a model — or a
single item — from TypeScript to the DSL without changing semantics, because
both frontends meet at the HIR.

Status: design sketch only; nothing here is implemented.

## Design goals

1. **Analyzable by construction.** The TS frontend must reject code outside
   the HIR subset; the DSL simply cannot express anything outside it. Every
   valid DSL program lowers, so the runtime never falls back and every model
   gets the distribution DAG, dependency info and optimized compilation.
2. **Expression-oriented, OCaml-flavoured.** `let … in` bindings, `if/then/else`
   as an expression, no statements, no mutation.
3. **Distributions are syntax.** `~Gaussian(0, sigma)` is a literal, visibly
   distinct from a number — the stochastic structure of a kernel is readable
   at a glance and trivially extractable.
4. **Less ceremony than the TS surface.** No
   `export default TransitionKernel((input, parameters) => …)` wrapper; the
   editor pane _is_ the function body, and the model context (places,
   parameters, attributes) is ambient.
5. **LSP-native.** Hand-written parser with error recovery producing a
   partial tree — diagnostics, completions and hovers must work on incomplete
   code while typing.

## Surface examples

Dynamics (per-token derivative; `'` marks a derivative binding — only real
attributes admit one):

```
per { x, v } ->
  x' = v
  v' = -params.k * x
```

Lambda — stochastic rate (`Pool` is an input place, `count Pool` its token
count; `inf` = always fire):

```
let pressure = count Pool * params.rate in
if pressure > 10 then inf else pressure
```

Lambda — predicate:

```
Pool[0].active && Pool[0].x >= params.threshold
```

Transition kernel (`~` introduces a distribution; `|>` maps over it;
output places are record labels checked against the transition's output arcs):

```
let noise = ~Gaussian(0, params.sigma) in
{ Target = [ { x = Pool[0].x
             , v = noise |> v -> v * 2
             , generation = Pool[0].generation + 1 } ] }
```

Kernel over all input tokens:

```
{ Out = Pool.map(token -> { x = token.x + 1, v = token.v }) }
```

Metric (future surface):

```
sum Infected.tokens by t -> t.viral_load
```

Notes:

- `params.<name>` is the single namespace for model parameters (mirrors
  `paramRef`).
- Input places are bare identifiers (quoted `` `Other Place` `` when the name
  isn't identifier-shaped, including `Instance::Port` scoped names).
- `count <place>` lowers to `length`; `inf` to the `Infinity` constant.
- Newline-separated record fields avoid comma-noise in dynamics; both `,` and
  newline are accepted separators.

## Grammar (EBNF)

```
program        := dynamics_body | expr
dynamics_body  := "per" pattern "->" deriv_block
deriv_block    := { deriv_binding }
deriv_binding  := ident "'" "=" expr (NEWLINE | ";")
pattern        := "{" ident { ("," | NEWLINE) ident } "}" | ident

expr           := "let" ident "=" expr "in" expr
                | "if" expr "then" expr "else" expr
                | pipe_expr
pipe_expr      := or_expr { "|>" lambda_expr }          (* distribution map *)
lambda_expr    := ident "->" expr
or_expr        := and_expr { "||" and_expr }
and_expr       := cmp_expr { "&&" cmp_expr }
cmp_expr       := add_expr [ ("<" | "<=" | ">" | ">=" | "==" | "!=") add_expr ]
add_expr       := mul_expr { ("+" | "-") mul_expr }
mul_expr       := unary_expr { ("*" | "/" | "%") unary_expr }
unary_expr     := ("-" | "!") unary_expr | pow_expr
pow_expr       := postfix_expr [ "^" unary_expr ]        (* right assoc *)
postfix_expr   := primary { "." ident | "[" expr "]"
                          | ".map" "(" lambda_expr ")" }
primary        := NUMBER | "true" | "false" | "inf" | "pi" | "e"
                | ident | quoted_ident
                | "~" ident "(" args ")"                  (* distribution *)
                | "count" primary
                | math_fn "(" args ")"                    (* sin, cos, sqrt, … *)
                | "(" expr ")"
                | record | list
record         := "{" [ field { ("," | NEWLINE) field } ] "}"
field          := (ident | quoted_ident) "=" expr
list           := "[" [ expr { "," expr } ] "]"
args           := [ expr { "," expr } ]
```

Deliberate omissions: loops, recursion, user function definitions, strings,
mutation, sequencing. Comments: `(* … *)` and `# line comment`.

## Implementation plan

### Lexer + parser

Hand-written: a lexer with precise token spans, and a recursive-descent parser
with a Pratt loop for binary operators (the grammar above is small enough that
the Pratt table is ~15 entries). Rationale over parser generators:

- **Error recovery** is the whole game for an editor language. On error, emit
  an `ErrorNode` carrying the span, synchronize on layout anchors (`let`,
  `in`, `,`, `}`, `]`, newline in deriv blocks), and keep parsing — the
  result is always a full tree with holes, never a hard failure.
- Documents are one expression, tens of lines — full reparse per keystroke is
  microseconds; no incremental parsing needed (unlike tree-sitter, which
  would still be a fine later swap for highlighting).

### AST → HIR lowering

Near 1:1 (`let`→`let`, `if`→`cond`, `|>`/`.map` on distributions →
`distributionMap`, `~D(…)`→`distribution`, `count`→`length`, records/lists →
`recordLit`/`arrayLit`, `per`-block → the `arrayMap`-over-tokens shape the
buffer-native emitter wants, with `x' = e` becoming record entry `x: e`).
`ErrorNode`s lower to a poisoned `unknown` node so downstream analyses still
run on the valid parts. Spans carry over directly — the DSL text _is_ the user
content.

### Semantic analysis

Reuse the HIR stack verbatim: `typecheckHir` + `analyzeHir` + `lintHirUserCode`
already operate on HIR with `SurfaceContext`, so the DSL gets every rule
(discrete derivatives, distribution-into-int, arc-weight bounds, shared
samples, …) for free. DSL-specific resolution happens pre-lowering:

- bare identifiers resolve, in order: pattern/let/lambda bindings → input
  place names → error with "did you mean" (Levenshtein over places/bindings);
- `params.x` checked against the parameter list at resolution time (same
  diagnostics as `hir:unknown-parameter`).

Type checking is bidirectional at the root: the surface fixes the expected
result type (derivative record / bool-or-rate / output record), which flows
into record literals and lists — this yields better messages than pure
inference ("this should be a token list for place `Target`" instead of a
mismatch at the leaf).

### LSP integration

The existing infrastructure was built language-agnostic in the right places —
transport, JSON-RPC protocol, diagnostics-store client, Monaco sync components
are all reusable unchanged. What changes is inside the worker:

1. **Document model.** DSL items don't need virtual TS files, prefixes or
   offset adjustment: the checker runs on the raw document. The
   `SDCPNLanguageServer` grows a per-item language tag
   (`Transition.language?: "typescript" | "petrinaut"` in the schema), and
   dispatches per item to the TS service or the DSL analyzer.
2. **Diagnostics.** DSL parse/resolve/type errors are `HirDiagnostic`s →
   the existing `check-hir.ts` conversion → the same
   `publishDiagnostics` fan-out. No protocol change (this is already how HIR
   lints ship today).
3. **Completions.** Context + partial tree driven: after `params.` list
   parameters (typed); after a place expression `.` list attributes from the
   color; in record position inside a kernel output, list the missing output
   places / missing attributes; keywords (`let`, `if`, `then`, `else`, `in`,
   `per`, `count`, `~Gaussian|Uniform|Lognormal`) elsewhere. The partial tree
   plus `SurfaceContext` answers "what is expected here" — no type-service
   needed.
4. **Hover/signature help.** Hover shows the resolved kind (parameter with
   type/default, place with color and arc weight, binding with inferred
   `HirType`); signature help covers distribution constructors and math
   functions from the same tables the HIR uses.
5. **Monaco.** Register a `petrinaut` language with a Monarch tokenizer (~40
   lines); the existing `CompletionSync`/`HoverSync`/`DiagnosticsSync`
   providers just need registering for the new language id alongside
   `"typescript"`.

### Migration story (TS ⇄ DSL)

Because both frontends meet at the HIR, migration is a pretty-printer:

- **TS → DSL**: `lowerTypeScriptToHir` then print HIR as DSL. Any item the
  TS frontend can lower (the analyzable subset — in practice the default
  templates and most real models) converts automatically; items outside the
  subset stay TS until rewritten. A one-shot "Convert to Petrinaut language"
  action per item, with a model-wide bulk action, both no-ops on failure.
- **DSL → TS**: same in reverse (print HIR as the TS idiom) — useful as an
  escape hatch and for trust-building diffing.
- Storage: per-item `language` field next to the code string; default stays
  `"typescript"` until the DSL is on by default.

## Open questions

- **Numeric semantics**: keep JS doubles (bit-compatibility with existing
  runs, trivial JS backend) vs. defining int as i64 (matches token format v2's
  ±2^53 discussion, matters for WASM/GPU backends). Sketch assumes doubles.
- **Comprehension power**: metrics realistically need `sum`/`filter`; is
  `sum <expr> by <lambda>` special syntax (analyzable, GPU-reducible) or a
  general `reduce` (more expressive, harder to fuse)? Leaning special forms.
- **Time**: none of the surfaces currently receive `t`/`dt`; if dynamics ever
  become time-dependent, `t` becomes an ambient like `params`.
- **Multi-token kernels with data-dependent counts** (produce N tokens where
  N is computed): today's TS surface can't either (tuple types); needs an arc
  semantics decision before syntax.
- **Naming**: place references by display name mirror the TS surface but are
  rename-fragile; the DSL could resolve through stable ids under the hood
  (documents store ids, editor renders names) — a real advantage over the TS
  frontend worth deciding early.
