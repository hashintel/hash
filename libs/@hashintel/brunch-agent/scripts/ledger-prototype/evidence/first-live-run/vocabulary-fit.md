# Epistemic vocabulary fit

A no-inference check of whether a small closed epistemic vocabulary can replace the open `disposition` text on Ledger Notes. Every Note in the recovered final [`ledger.md`](./ledger.md) was classified by hand from both its disposition and its content. This is one reader's classification of one run with one generous persona; it tests vocabulary fit, not model classification accuracy or behavioural value.

## First sketch

```ts
authority: "stated" | "consulted" | "inferred" | "assumed";
standing: "settled" | "tentative" | "contested" | "open" | "inapplicable";
precision?: "exact" | "approximate" | "qualitative" | "unknown";
qualifier?: string;
```

## Result

| Outcome | Notes | Count |
| --- | --- | --- |
| Clean fit: one authority, one standing; remainder is genuine prose | n1, n2, n4, n5, n6, n7, n9, n11, n12, n17, n20, n22, n23, n24, n25, n26, n29, n30, n31, n32, n33, n34, n38, n39, n40, n45, n46, n51, n54 | 29 |
| Settled fact and open gap in one Note | n8, n10, n13, n18, n35, n36, n37, n44, n47, n48, n53 | 11 |
| Assumption reported by the person, not made by the agent | n14, n16, n21, n41, n52 (also n47, n48, n53 above) | 5 |
| Agent-recorded gap or question with no content authority | n3, n19, n27, n28, n42, n43, n55 | 7 |
| Person's fact combined with the agent's derivation | n49, n50 | 2 |
| Ambiguous boundary | n15 | 1 |

29 of 55 Notes (53%) fit the first sketch cleanly.

## Findings

**Authority conflates who supplied a Note with what it rests on.** "Assumption" appears on the source side eight times: team planning assumptions (n21, n53) and industry-practice defaults accepted for planning (n16, n52). The sketch forces a lossy choice: `stated` drops that it is an assumption; `assumed` drops that the person supplied it. Agent-recorded gaps have no applicable authority at all.

**Many Notes mix standings.** Eleven Notes record a settled fact alongside an explicit gap, for example n8: "close to four weeks … start and end points, variation, and the quarantine component are not yet established". Two combine the person's account with the agent's arithmetic (n50 adds the four-day quarantine assumption to fitted lead times). The elicitor sometimes already split these (n15 as the claim, n19 as the open matter).

**Standing values are exercised; `inapplicable` is not.** `settled`, `tentative`, `contested` and `open` all occur. `inapplicable` never occurs, as expected in a run without required categories.

**Several disposition words belong to other dimensions.** "Typical", "fitted" and "general account" describe basis or generality, not precision. "Clarification", "resolved", "partially resolved" and "contextual coexistence" describe the relation between a Note and the Note it supersedes. `exact` never occurs as a distinction.

**`contested` versus `open` is the likeliest classification boundary to be noisy.** "Unresolved tension" labels both conflicting claims (n26, n29, n40) and questions about a conflict (n28, n43).

## Revised sketch

```ts
source: "person" | "material" | "agent";
basis?: "observed" | "documented" | "practiced" | "estimated" | "assumed" | "inferred";
standing: "settled" | "tentative" | "contested" | "open" | "inapplicable";
precision?: "approximate" | "qualitative";
qualifier?: string;
```

Every `basis` value has an instance: "fitted from purchasing records", "documented parameters", "typical team understanding", "Elena estimates", "planning assumption", and the agent's derivations. A person-side assumption becomes `person` + `assumed`; an agent-recorded gap becomes `agent` + `open`. With this split, the five person-side assumptions and seven agent gaps fit, giving 41 of 55 (75%).

The remaining 14 are a Note-granularity question rather than a vocabulary one. A guidance rule of one standing per Note, with each gap filed as its own `open` Note, resolves them at a cost of roughly 20% more Notes and makes an open-matters or coverage view complete.

Definitions to state in guidance:

- `contested`: two recorded accounts disagree.
- `open`: something consequential is unknown, unasked or deferred.

## What this does not establish

Whether a model classifies consistently, whether derived views (coverage, open and contested lists) change elicitation or construction behaviour, and whether the vocabulary fits other cases or a less generous persona. Those need persona runs with an independent audit.
