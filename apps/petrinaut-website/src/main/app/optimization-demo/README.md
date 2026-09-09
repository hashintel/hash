---
layer: website.optimization
role: "Optimization hosts: the in-browser runtime the main demo mounts, and the service capability the /optimization route mounts"
---

# Optimization hosts

Two providers put a `PetrinautOptimizationContext` value around
`LocalStorageDemoApp`; each route mounts one of them.

- `browser-optimization-provider.tsx` provides `createBrowserOptimization()`
  from `@hashintel/petrinaut-core/browser-optimization`. The main demo
  (`routes/index.tsx`) mounts it, and Petrinaut connects it while the
  experimental **In-browser optimization** setting is on.
- `petrinaut-opt-optimization-provider.tsx` provides the service capability
  built in `petrinaut-opt-optimization.ts`: `createServicePetrinautOptimization`
  against the `/api/petrinaut-opt/` path, which `vite.config.ts` proxies to the
  local Python optimizer. The `/optimization` route (`routes/optimization.tsx`)
  mounts it and is found only when `VITE_PETRINAUT_OPT_PROVIDER=service` is
  set.
