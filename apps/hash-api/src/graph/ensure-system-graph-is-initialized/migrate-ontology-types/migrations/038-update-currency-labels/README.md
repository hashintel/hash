# Currency labels

Every existing currency type keeps its ISO 4217 code as the right label. For example, US and Canadian dollars display as `$value USD` and `$value CAD`, so the shared dollar symbol remains unambiguous.

The symbol table comes from [Unicode CLDR 49](https://github.com/unicode-org/cldr/tree/release-49/common/main): English overrides the root locale, and the narrow symbol takes precedence over the standard symbol. A symbol identical to the currency code is omitted. This gives 100 of the 156 existing currency types a prefix, including the six that already had one. The remaining 56 retain their code-only labels. Letter abbreviations such as `kr` and `Rp` have a non-breaking space before the number.

This is a fixed English display convention. It does not implement locale-specific symbol placement, grouping, decimal separators, or accounting formats. Unicode describes the same [symbol-plus-code pattern](https://www.unicode.org/reports/tr35/tr35-numbers.html#Currency_Formats) for disambiguating narrow symbols. The CLDR data is distributed under the accompanying Unicode license.

Migration 038 updates the latest existing schemas and preserves their constraints, parents, and conversion expressions. It creates new versions for the 100 changed currencies and records those versions in migration state. Currency types whose labels already match are unchanged. Retrying the migration finds the latest versions, including after an interrupted run, and does not create duplicates.

Earlier type versions remain available to existing properties and values. This change does not add currency exchange-rate conversions or change the set of currencies. The migration number leaves room for the independent unit-catalogue migrations 034–037; it has no dependency on them.
