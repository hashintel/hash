---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Constraints are a concept of their own: boolean conditions over the parameter space or the simulation state, authored as TypeScript, lowered to serializable HIR, and validated against a runtime schema of the full HIR grammar. Optimization studies carry a list of them, authored in the create-optimization drawer and exposed through the describe protocol, where the Python binding reads them as callables with a boolean, a signed margin, a pydantic validator, and a SymPy view. The drawer's constraint editors type-check as typed through a language-worker session per row, with completion for `scenario.*`, `parameters.*` and `state.places.*`, hover types, and Run held until every constraint compiles. Declarative only: nothing enforces them yet.
