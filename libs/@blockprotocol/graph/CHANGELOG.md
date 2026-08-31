# @blockprotocol/graph

## 0.5.0

### Minor Changes

- Make `rightEntity` / `leftEntity` on `LinkEntityAndRightEntity` / `LinkEntityAndLeftEntity` possibly `undefined`, reflecting what `getOutgoingLinkAndTargetEntities` / `getIncomingLinkAndSourceEntities` actually return when a link's `has-right-entity` / `has-left-entity` edge is not resolved into the subgraph. Previously an unsafe cast hid this, allowing runtime crashes when consumers indexed into a missing target entity array. ([@TimDiekmann](https://github.com/TimDiekmann), [#8992](https://github.com/hashintel/hash/pull/8992))

## 0.4.3

### Patch Changes

- Updated dependencies:
  - @blockprotocol/type-system@0.2.2

## 0.4.2

### Patch Changes

- update dependencies ([@CiaranMn](https://github.com/CiaranMn), [#8568](https://github.com/hashintel/hash/pull/8568))

## 0.4.1

### Patch Changes

- Updated dependencies:
  - @blockprotocol/type-system@0.2.1

## 0.4.0

### Minor Changes

- major overhaul that removes temporal/non-temporal split (all now temporal) and implements latest type system ([@CiaranMn](https://github.com/CiaranMn), [#8083](https://github.com/hashintel/hash/pull/8083))

### Patch Changes

- Updated dependencies:
  - @blockprotocol/type-system@0.2.0

## 0.3.3

### Patch Changes

- remove node-fetch dependency ([@CiaranMn](https://github.com/CiaranMn), [#1310](https://github.com/blockprotocol/blockprotocol/pull/1310))

## 0.3.2

### Patch Changes

- add 'icon' and 'labelProperty' to entity type metadata ([@CiaranMn](https://github.com/CiaranMn), [#1360](https://github.com/blockprotocol/blockprotocol/pull/1360))

## 0.3.1

### Patch Changes

- Ensure non-temporal BP methods have a non-temporal return, even when passed a temporal subgraph. Add `getFetchUrlFromTypeId` parameter to the codegen script. Gracefully handle non-intersecting edges in `getIncomingLinksForEntity` and `getOutgoingLinksForEntity`. ([@benwerner01](https://github.com/benwerner01), [#1349](https://github.com/blockprotocol/blockprotocol/pull/1349))

- Adds a `requestLinkedQuery` method to the BP graph module ([@benwerner01](https://github.com/benwerner01), [#1353](https://github.com/blockprotocol/blockprotocol/pull/1353))

- add suffix to auto-generated data types, to avoid name clashes ([@CiaranMn](https://github.com/CiaranMn), [#1311](https://github.com/blockprotocol/blockprotocol/pull/1311))

## 0.3.0

### Minor Changes

- Fix determinism in codegen ([@Alfred-Mountfield](https://github.com/Alfred-Mountfield), [#1264](https://github.com/blockprotocol/blockprotocol/pull/1264))

- Fix re-exports of helper types in codegen ([@Alfred-Mountfield](https://github.com/Alfred-Mountfield), [#1265](https://github.com/blockprotocol/blockprotocol/pull/1265))

### Patch Changes

- Add retry logic around type fetching in codegen ([@Alfred-Mountfield](https://github.com/Alfred-Mountfield), [#1279](https://github.com/blockprotocol/blockprotocol/pull/1279))

- Update links in README and comments ([@nonparibus](https://github.com/nonparibus), [#1273](https://github.com/blockprotocol/blockprotocol/pull/1273))

## 0.2.2

### Patch Changes

- Updated dependencies:
  - @blockprotocol/core@0.1.2

## 0.2.1

### Patch Changes

- codegen: fix nested output folder creation ([@CiaranMn](https://github.com/CiaranMn), [#1182](https://github.com/blockprotocol/blockprotocol/pull/1182))

- Updated dependencies:
  - @blockprotocol/type-system@0.1.1

## 0.2.0

### Minor Changes

- Introduce an improved codegen utility with support for multiple files, better errors, type name overrides, and more. ([@Alfred-Mountfield](https://github.com/Alfred-Mountfield), [#1158](https://github.com/blockprotocol/blockprotocol/pull/1158))

### Patch Changes

- Updated dependencies:
  - @blockprotocol/core@0.1.1

## 0.1.0

### Minor Changes

- rename Block Protocol 'Services' to 'Modules' ([@CiaranMn](https://github.com/CiaranMn), [#985](https://github.com/blockprotocol/blockprotocol/pull/985))

- multiple breaking changes for updated Graph Module specification and type system ([@CiaranMn](https://github.com/CiaranMn), [#879](https://github.com/blockprotocol/blockprotocol/pull/879))

### Patch Changes

- Updated dependencies:
  - @blockprotocol/type-system@0.1.0
  - @blockprotocol/core@0.1.0

## 0.0.20

### Patch Changes

- Ensure callbacks to services passed via react are never stale ([@nathggns](https://github.com/nathggns), [#926](https://github.com/blockprotocol/blockprotocol/pull/926))

- Allow creating services before element is available ([@nathggns](https://github.com/nathggns), [#922](https://github.com/blockprotocol/blockprotocol/pull/922))

- Updated dependencies:
  - @blockprotocol/core@0.0.14

## 0.0.19

### Patch Changes

- Update package metadata ([@kachkaev](https://github.com/kachkaev), [#875](https://github.com/blockprotocol/blockprotocol/pull/875))

- Updated dependencies:
  - @blockprotocol/core@0.0.13

## 0.0.18

### Patch Changes

- change entity & type updates to be by overwrite, not merge ([@CiaranMn](https://github.com/CiaranMn), [#631](https://github.com/blockprotocol/blockprotocol/pull/631))

## 0.0.17

### Patch Changes

- Updated dependencies:
  - @blockprotocol/core@0.0.12

## 0.0.16

### Patch Changes

- add missing type to block callback list ([@CiaranMn](https://github.com/CiaranMn), [#593](https://github.com/blockprotocol/blockprotocol/pull/593))

- Add `labelProperty` to `EntityType` ([@yusufkinatas](https://github.com/yusufkinatas), [#589](https://github.com/blockprotocol/blockprotocol/pull/589))

- simplify custom element base class ([@CiaranMn](https://github.com/CiaranMn), [#598](https://github.com/blockprotocol/blockprotocol/pull/598))

## 0.0.15

### Patch Changes

- expose registerCallbacks to users for bulk callback updating ([@CiaranMn](https://github.com/CiaranMn), [#576](https://github.com/blockprotocol/blockprotocol/pull/576))

- Change TypeScript config and rebuild ([@kachkaev](https://github.com/kachkaev), [#577](https://github.com/blockprotocol/blockprotocol/pull/577))

- Updated dependencies:
  - @blockprotocol/core@0.0.11

## 0.0.14

### Patch Changes

- Updated dependencies:
  - @blockprotocol/core@0.0.10

## 0.0.13

### Patch Changes

- Mention `npx create-block-app@latest` instead of `npx create-block-app` in README ([@kachkaev](https://github.com/kachkaev), [#490](https://github.com/blockprotocol/blockprotocol/pull/490))

- Updated dependencies:
  - @blockprotocol/core@0.0.9
