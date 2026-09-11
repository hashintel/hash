# Frozen Inventory-derived slice

`batch.json` is one `mutate_petrinet` input as the model would emit it on the batched carrier: one coloured type (`Lot`), three parameters, one differential equation, two places, one stochastic and one predicate transition, and four arcs. It is the smallest code-bearing region the carrier must express before the Inventory worked model depends on it. Consumer: `test/inventory-slice.test.ts`, which parses it with `mutatePetrinetInputSchema`, applies it through the canonical mutations, and asserts the result is compiler-clean via `@hashintel/petrinaut-core/diagnostics`.

The observation hash is a placeholder; the fixture is carrier evidence, not a recorded conversation, and its basis is explicitly absent. Not genuine elicited testimony or semantic acceptance of an Inventory model.

Stored-byte SHA-256: `0396391b1f5335495d64d6146957105ec1be6996a32d798619c80361448ae3da`
