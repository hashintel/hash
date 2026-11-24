---
layer: core.document
role: Pure functions that read a document and hold no state, for ids, arc endpoints, place dynamics, parameter values, selection, equality and hash
---

# Document helpers

Functions that read or normalise an SDCPN document and hold no state. The
types they work on are declared in [the document types](layer:core.types).
Editing a document is the job of [the actions](layer:core.actions), and
reading one from a file the job of [the file format](layer:core.file-format).
The id check uses the UUID test of [the token value model](layer:core.tokens).

## Interface

The folder has no entry file. Each file is one small library, and another
block imports the file that holds the function it needs. A caller starts from
one of these.

| Function                                                | File                         | What it answers                                                                   |
| ------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `toPetrinautId`, `canonicalizePetrinautIds`             | `petrinaut-id.ts`            | The Petrinaut id of any id, and a net with every id and reference converted       |
| `getArcEndpoint`                                        | `arc-endpoints.ts`           | Which place or component port an arc touches                                      |
| `generateArcId`                                         | `arc-id.ts`                  | The id the editor gives an arc, made from the ids of its two ends                 |
| `getRunningEquationIds`, `withoutDifferentialEquations` | `place-dynamics.ts`          | The differential equations a place runs, and a place without some of them         |
| `isSupportedArity`                                      | `equation-arity.ts`          | Whether one differential equation may couple that many tokens                     |
| `resolveNetParameterValues`                             | `parameter-values.ts`        | The value of each parameter for a run, from its default and the inputs of the run |
| `canonicalizeSelection`                                 | `selection.ts`               | The one order of a selection, without duplicates                                  |
| `GRID_SIZE`                                             | `grid-size.ts`               | The grid unit the node positions of the bundled examples are multiples of         |
| `isSDCPNEqual`                                          | `deep-equal.ts`              | Whether two documents are equal                                                   |
| `hashPetrinautDocument`                                 | `hash-petrinaut-document.ts` | A hash of a document, or of the part of it that a simulation reads                |

## Protocol: the id rule

A Petrinaut id is a lowercase UUID. `toPetrinautId` lowercases a UUID and maps
any other id to its UUIDv5 under one fixed namespace, so a legacy id names the
same item on every load. `canonicalizePetrinautIds` applies the rule to every
definition of a net and to every reference to it. The namespace never
changes: ids derived from it are stored in documents, URLs and host storage.

## Rules

| Rule                                                                                | Reason                                                                                              | Held by                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| The same legacy id converts to the same id, and converting twice changes nothing.   | A document is converted on every load, and a host stores the converted ids.                         | `petrinaut-id.test.ts`, which pins two converted ids           |
| A selection has one order: by type, then by id in UTF-16 code units.                | The editor compares selections by position, and a server must order one as the browser does.        | `selection.test.ts`                                            |
| `selection.ts` imports `arc-id.ts` and nothing else.                                | The package entry `./selection` promises a host an import with no dependency.                       | No test: read the imports of `dist/selection.js` after a build |
| The hash ignores the order of object keys, and the parts a caller excludes.         | Two saves of one net must hash alike, and a moved node must not look like a change to a simulation. | `hash-petrinaut-document.test.ts`                              |
| Two documents are equal when one has a key set to `undefined` that the other lacks. | A JSON round trip drops such a key.                                                                 | `deep-equal.test.ts`                                           |

## Pitfalls

| Symptom                                                                    | Cause                                                                                                                                                                                                     | What avoids it                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This layer and [composition](layer:core.composition) depend on each other. | `getComponentPortEndpointComponent` in `arc-endpoints.ts` calls `resolveComponent` of composition to find the component behind a port. Composition reads ids, arc endpoints and place dynamics from here. | A function that needs a resolved component belongs in composition. Add no second import of composition here: the pair ends when this function moves there. |
