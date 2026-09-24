#import "template/lib.typ": note, rule, template, term

#show: body => template(
  body,
  title: "Reference specimen",
  description: "Synthetic sequence notation for rendering checks. Not part of the HashQL Reference.",
  links: ((label: "HashQL Reference", href: "index.html"),),
  vocabulary: (
    sequence: (name: "sequence", definition: [An ordered collection of symbols.]),
    position: (name: "position", definition: [A zero-based index identifying one occurrence in a sequence.]),
    symbol: (name: "symbol", definition: [A named item that can occupy a sequence position.]),
  ),
)

= Reference specimen

== Introduction <introduction>

A #emph(term("sequence")) is an ordered collection of #term("symbol", form: [symbols]). Two #term("sequence", form: [sequences]) are equal when they contain the same symbols in the same positions; repeated symbols occupy distinct positions. The notation below describes a small example language used only by this specimen. Its grammar, rules and examples make no claim about HashQL.

@notation defines the written form. @sequences defines the empty and nonempty cases, while @boundaries distinguishes an absent position from a position containing a symbol. These sections can be read independently, with references supplying the definitions each one uses.

== Notation <notation>

The productions use quoted terminals, square brackets for an optional part and braces for repetition. Whitespace separates symbols in the presentation but is not itself a symbol. A sequence has an opening bracket, zero or more comma-separated names and a closing bracket.

```
Sequence = "[" [ Name { "," Name } ] "]" .
Name     = Letter { Letter } .
Letter   = "a" … "z" .
```

#figure(
  table(
    columns: (auto, 1fr),
    table.header([Form], [Meaning]),
    [`"text"`], [A terminal written literally],
    [`[ X ]`], [An optional occurrence of X],
    [`{ X }`], [Zero or more occurrences of X],
    [`X | Y`], [One of the alternatives X and Y],
  ),
  caption: [Notation used in the productions.],
) <notation-table>

The brackets in the first production are quoted terminals. The unquoted brackets instead describe an optional part, as @notation-table distinguishes. Thus `[]`, `[alpha]` and `[alpha, beta]` are three complete forms.

== Sequences <sequences>

=== Empty sequence <empty-sequence>

#rule("sequence.empty")[
  The form `[]` denotes the empty sequence. Its length is zero, and it has no occupied position. The empty sequence is a value rather than an omitted argument.
]

#note[
  Empty and absent are different cases. An empty sequence contains no symbols; an absent position belongs to the indexing operation described in @boundaries.
]

=== Nonempty sequence <nonempty-sequence>

#rule("sequence.order")[
  #term("symbol", form: [Symbols]) occur in the order in which their names are written. Repeating a name preserves both occurrences: `[alpha, beta, alpha]` has three occupied positions, not two.
]

#figure(
  table(
    columns: 3,
    table.header([Position], [Symbol], [Preceding symbols]),
    [0], [`alpha`], [`[]`],
    [1], [`beta`], [`[alpha]`],
    [2], [`alpha`], [`[alpha, beta]`],
  ),
  caption: [Positions in a three-symbol sequence.],
) <positions-table>

@positions-table preserves the two occurrences of `alpha`. An order-insensitive collection would not support the same interpretation of a position, so it is outside this specimen's definition of sequence.

==== A repeated symbol retains its position <repeated-symbol>

A repeated name does not merge positions. The first and third entries remain separately addressable even though their symbols are equal. Removing the first entry changes the positions of the remaining entries; it does not change their relative order.

== Boundaries and length <boundaries>

For a #term("sequence") of length $n$, the occupied #term("position", form: [positions]) satisfy $0 <= i < n$. An index outside that interval identifies no symbol. This convention also covers the empty sequence from @empty-sequence, because the corresponding interval has no members.

$ "positions"(s) = {i in ZZ | 0 <= i < "length"(s)} $

Length counts occurrences rather than distinct names. Concatenating two sequences preserves their internal order and adds their lengths:

$ "length"(a class("binary", "++") b) = "length"(a) + "length"(b) $

The following Rust example illustrates this counting convention. It is not a HashQL program.

```rust
let symbols = ["alpha", "beta", "alpha"];
assert_eq!(symbols.len(), 3);
```

=== Long names <long-names>

Names are not abbreviated by the written form. This example contains one long name followed by one short name; the two remain separate symbols.

```
[alongnamethatcontinueswithoutabbreviationandpreserveseveryletterofitswrittenform, beta]
```

== Reading the examples <examples>

The examples follow three conventions:

+ A complete form includes both delimiters.
+ A repeated name introduces another occurrence.
+ A position is interpreted against the length of the sequence being read.

An example can illustrate a rule without replacing its general statement. The rule #link("#rule-sequence.order")[[sequence.order]] gives the ordering property; the particular sequence in @nonempty-sequence supplies one instance.

#quote(block: true)[
  Equal symbols can occupy different positions.
]

Here the quoted sentence restates the specimen's ordering rule. It is an illustrative quotation, not an attribution to an external source.
