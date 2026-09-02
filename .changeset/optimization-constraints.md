---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut-cli": patch
---

Constraints are a concept of their own: boolean conditions over the parameter space or the simulation state, authored as TypeScript, lowered to serializable HIR, and validated against a runtime schema of the full HIR grammar. Optimization studies carry a list of them, authored in the create-optimization drawer and exposed through the describe protocol, where the Python binding reads them as callables with a boolean, a signed margin, a pydantic validator, and a SymPy view. Declarative only: nothing enforces them yet.
