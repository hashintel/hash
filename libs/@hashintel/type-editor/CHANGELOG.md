# @hashintel/type-editor

## 0.0.21

### Patch Changes

- [#2258](https://github.com/hashintel/hash/pull/2258) [`867b43527`](https://github.com/hashintel/hash/commit/867b4352757c9d4f606837a05df16d0cb850304c) Thanks [@nathggns](https://github.com/nathggns)! - Ensures consumers of the design system, and type editor, can apply global font variables using new `fluidFontClassName` export from the design system, and applies this to some elements which use portals. New `fluidTypographyStyles` export to actually set the styles for this class name

- [#2255](https://github.com/hashintel/hash/pull/2255) [`ca1ff539c`](https://github.com/hashintel/hash/commit/ca1ff539c39bc8c0cb3bf14d7a4b9285f6017b59) Thanks [@nathggns](https://github.com/nathggns)! - Disable the new/edit type modals until a change has been made, and associated fixes to validation.

- [#2271](https://github.com/hashintel/hash/pull/2271) [`68368586b`](https://github.com/hashintel/hash/commit/68368586ba23c66d5ab4f85dfe71b0117ade40fb) Thanks [@nathggns](https://github.com/nathggns)! - Insert property/link rows in the type editor are now "sticky" so you don't need to scroll down to click them.

  Scroll to newly inserted type logic has been improved to be more reliable.

  Design system has been updated to have a new `mdReverse` style in the theme, which is the same as `md` but flipped on the y-axis, and border radius on WhiteCard has been fixed.

- Updated dependencies [[`867b43527`](https://github.com/hashintel/hash/commit/867b4352757c9d4f606837a05df16d0cb850304c), [`68368586b`](https://github.com/hashintel/hash/commit/68368586ba23c66d5ab4f85dfe71b0117ade40fb)]:
  - @hashintel/design-system@0.0.6

## 0.0.19

### Patch Changes

- [#2196](https://github.com/hashintel/hash/pull/2196) [`939d9b4ee`](https://github.com/hashintel/hash/commit/939d9b4ee5859ad00ce152dbb9c1ab4d1806460c) Thanks [@CiaranMn](https://github.com/CiaranMn)! - fix option <> selection comparison in type selectors

- Updated dependencies [[`939d9b4ee`](https://github.com/hashintel/hash/commit/939d9b4ee5859ad00ce152dbb9c1ab4d1806460c)]:
  - @hashintel/design-system@0.0.5
