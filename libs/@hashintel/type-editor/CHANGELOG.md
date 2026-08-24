# @hashintel/type-editor

## 0.0.26

### Patch Changes

- Updated dependencies:
  - @blockprotocol/type-system@0.2.0
  - @hashintel/design-system@0.0.9
  - @blockprotocol/graph@0.4.0

## 0.0.25

### Patch Changes

- update detection of link types to account for inheritance ([@CiaranMn](https://github.com/CiaranMn), [#2937](https://github.com/hashintel/hash/pull/2937))

- take data type options as prop, not fixed list ([@CiaranMn](https://github.com/CiaranMn), [#3784](https://github.com/hashintel/hash/pull/3784))

- add 'extends' section and handle inherited properties and links ([@CiaranMn](https://github.com/CiaranMn), [#2909](https://github.com/hashintel/hash/pull/2909))

- show / edit label property in type editor ([@CiaranMn](https://github.com/CiaranMn), [#3984](https://github.com/hashintel/hash/pull/3984))

- validate type parents ([@CiaranMn](https://github.com/CiaranMn), [#2966](https://github.com/hashintel/hash/pull/2966))

- add icons to type selectors ([@CiaranMn](https://github.com/CiaranMn), [#2972](https://github.com/hashintel/hash/pull/2972))

- Updated dependencies:
  - @hashintel/design-system@0.0.8

## 0.0.24

### Patch Changes

- add 'open' link button to link destination entity types ([@luisbettencourt](https://github.com/luisbettencourt), [#2616](https://github.com/hashintel/hash/pull/2616))

## 0.0.23

### Patch Changes

- Added 'canEditResource' to the ontology functions to determine if a property/link type is editable. ([@luisbettencourt](https://github.com/luisbettencourt), [#2516](https://github.com/hashintel/hash/pull/2516))

- Changed the copy property type hover tooltip ([@luisbettencourt](https://github.com/luisbettencourt), [#2363](https://github.com/hashintel/hash/pull/2363))

- Prevent 'add a property' button from appearing over the 'allow multiple' menu ([@luisbettencourt](https://github.com/luisbettencourt), [#2519](https://github.com/hashintel/hash/pull/2519))

- Fix top offset related visual bug on Safari ([@yusufkinatas](https://github.com/yusufkinatas), [#2594](https://github.com/hashintel/hash/pull/2594))

- Added the ability to upgrade the version of expected entity types in links ([@luisbettencourt](https://github.com/luisbettencourt), [#2543](https://github.com/hashintel/hash/pull/2543))

- Updated dependencies:
  - @hashintel/design-system@0.0.7

## 0.0.21

### Patch Changes

- Adds a `fluidFontClassName` export for applying global font variables, and a `fluidTypographyStyles` export that defines the styles for that class name. Applied to some elements which use portals. ([@nathggns](https://github.com/nathggns), [#2258](https://github.com/hashintel/hash/pull/2258))

- Disable the new/edit type modals until a change has been made, and associated fixes to validation. ([@nathggns](https://github.com/nathggns), [#2255](https://github.com/hashintel/hash/pull/2255))

- Insert property/link rows in the type editor are now "sticky" so you don't need to scroll down to click them. ([@nathggns](https://github.com/nathggns), [#2271](https://github.com/hashintel/hash/pull/2271))

  Scroll to newly inserted type logic has been improved to be more reliable.

  Design system has been updated to have a new `mdReverse` style in the theme, which is the same as `md` but flipped on the y-axis, and border radius on WhiteCard has been fixed.

- Updated dependencies:
  - @hashintel/design-system@0.0.6

## 0.0.19

### Patch Changes

- fix option <> selection comparison in type selectors ([@CiaranMn](https://github.com/CiaranMn), [#2196](https://github.com/hashintel/hash/pull/2196))

- Updated dependencies:
  - @hashintel/design-system@0.0.5
