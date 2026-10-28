# HashQL TypeScript SDK

## File Structure

Unlike other parts of the codebase, the SDK does not follow fractal file structuring. Instead, it borrows its file-structure conventions from Effect.

- Prefer a flat hierarchy.
- Files are named in `PascalCase`, matching their module names. They should be imported as modules: `import * as Foo from "./Foo.js"`.
- Folders named in `kebab-case` are used for categorisation, whereas `PascalCase` folders always contain an `index.ts` file. Categorisation folders must never contain an `index.ts` file.
- Internal utilities use `kebab-case` names and are located in a top-level `internal` folder. Module-specific utilities are located in the corresponding module folder and also use `kebab-case` names.
- We use barrel files (`index.ts`) to expose modules at the top level.
- Type-level methods are declared inside a namespace with the same name as the type.

We use these conventions because much of the fractal file structure is unnecessary. Explicit file imports make it clear which module is being imported (`foo.js` versus `foo/index.js`), while treating files as modules supports functional programming patterns without overloading the namespace. With tree shaking, barrel files no longer pose a problem. This approach also provides a clear separation between type-level methods and module-level exports.

## Testing Strategy

A module may have two corresponding test files: a unit test, `<Module>.test.ts`, and a type test, `<Module>.test-d.ts`. Both are optional and should be created only when needed. Multiple facet files are not permitted; for example, `<Module>.packaging.test.ts` is not allowed. Integration tests may be located in the separate `tests/` directory and must use `kebab-case` names ending in `.integration.test.ts`. Test-specific utilities are also located in the `tests/` directory.

For modules with an `index.ts` file, the unit test must be named `index.test.ts` and the type test must be named `index.test-d.ts`. Both files must be located in the module folder.

Benchmarks are located in the `benches/` directory and must use `kebab-case` names ending in `.bench.ts`.
