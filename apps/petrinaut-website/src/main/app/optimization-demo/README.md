---
layer: website.optimization
role: "Optimization host: the in-browser runtime the demo mounts around the editor"
---

# Optimization host

`browser-optimization-provider.tsx` puts a `PetrinautOptimizationContext` value
around `LocalStorageDemoApp`: `createBrowserOptimization()` from
`@hashintel/petrinaut-core/browser-optimization`, which runs the Optuna study
in a Pyodide web worker. The main demo (`routes/index.tsx`) mounts it, and
Petrinaut connects it while the experimental **In-browser optimization**
setting is on.
