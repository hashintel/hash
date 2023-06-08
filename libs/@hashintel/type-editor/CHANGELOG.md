# @hashintel/type-editor

## 0.0.23

### Patch Changes

- [#2516](https://github.com/hashintel/hash/pull/2516) [`eb66cc431`](https://github.com/hashintel/hash/commit/eb66cc431fab214a5dfc50ff6a4fbb6a38f3232b) Thanks [@luisbettencourt](https://github.com/luisbettencourt)! - Added 'canEditResource' to the ontology functions to determine if a property/link type is editable.

- [#2363](https://github.com/hashintel/hash/pull/2363) [`77d95f178`](https://github.com/hashintel/hash/commit/77d95f17888e4c33ae5d93df9b41792c393e0764) Thanks [@luisbettencourt](https://github.com/luisbettencourt)! - Changed the copy property type hover tooltip

- [#2519](https://github.com/hashintel/hash/pull/2519) [`b3a0b3542`](https://github.com/hashintel/hash/commit/b3a0b354283f7925ad645653f364e794fdf9364f) Thanks [@luisbettencourt](https://github.com/luisbettencourt)! - Prevent 'add a property' button from appearing over the 'allow multiple' menu

- [#2594](https://github.com/hashintel/hash/pull/2594) [`b54ec0de1`](https://github.com/hashintel/hash/commit/b54ec0de16b94218508386a618664538dab31909) Thanks [@yusufkinatas](https://github.com/yusufkinatas)! - Fix top offset related visual bug on Safari

- [#2543](https://github.com/hashintel/hash/pull/2543) [`d0b0a5fd9`](https://github.com/hashintel/hash/commit/d0b0a5fd9596c6639e6cbaf8df0a13b1338fe1ee) Thanks [@luisbettencourt](https://github.com/luisbettencourt)! - Added the ability to upgrade the version of expected entity types in links

- Updated dependencies [[`f3a2f5ee9`](https://github.com/hashintel/hash/commit/f3a2f5ee9c25a3c7fead39453a76e3b93438aa17), [`0581e2589`](https://github.com/hashintel/hash/commit/0581e258954552e4ad5a677ef1fa94e386e820ca), [`f84343c1c`](https://github.com/hashintel/hash/commit/f84343c1c5c1522b4799ebe0f2c1ba9ebcbad8eb)]:
  - @hashintel/design-system@0.0.7

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
