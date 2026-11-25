# `@local/brand-fonts`

HASH's brand typefaces, HASH Sans and HASH Mono, for the apps and Storybooks in this repository.

## Licensing

The font files are proprietary. HASH Sans is a derivative of [KH Teka](https://khtype.com) and HASH Mono is a derivative of KH Teka Mono. HASH licenses both from KH Type under the [KH Type EULA](./hash-sans/KH-Type-EULA.pdf). [LICENSE.md](./LICENSE.md) states who may use the files. Read the EULA before changing how the fonts are used. It sets four rules for this repository:

- **Never publish the fonts.** The EULA forbids distributing them, and forbids embedding them in a software product whose users would then use them. Import this package from an app that is never published, or from the Storybook configuration of a published package. Never import it from the source of a published package such as `@hashintel/ds-components` or `@hashintel/petrinaut`: a library build embeds the fonts its source imports in the stylesheet it ships.
- **Leave the font files as KH Type delivered them.** The EULA forbids modifying, converting and renaming the fonts. Subsetting the character set is the one change it allows.
- **Check the domain before a new deployment.** The standard KH Type web license covers one domain and its subdomains. Before a site on another domain loads this stylesheet, confirm that HASH's license covers that domain.
- **Keep the EULA with the fonts.** It must accompany the font files when they are passed to anyone working on HASH's behalf. That person deletes the files when the work ends.

Two checks enforce the first rule. The published packages' lint rules reject an `@local/*` import from their source. [`check-package-fonts.mjs`](./check-package-fonts.mjs) runs when one of them is packed, and fails if a font from this package is among the files about to be published.

### Outside HASH

HASH's license does not extend to you. Before you build or deploy an app or Storybook from this repository, remove its `@local/brand-fonts/hash-sans.css` import. The interface then uses the system fonts.

## Usage

```ts
import "@local/brand-fonts/hash-sans.css";
```

The one stylesheet loads both typefaces, which are always used together. It declares two families and sets a variable for each on `:root`:

| Family      | Variable           |
| ----------- | ------------------ |
| `HASH Sans` | `--salt-font-body` |
| `HASH Mono` | `--salt-font-mono` |

Those are the variables through which `@hashintel/ds-components`, and so `@hashintel/petrinaut`, take a host's own fonts. With a variable unset the published packages use the system font, which is what an npm consumer gets.

Both are variable fonts with a weight axis, upright and italic: HASH Sans from 300 to 900, and HASH Mono from 200 to 900. They cover Latin text, arrows and the common mathematical symbols. The system fonts follow them in the stack for everything else.

The files of both families are in `hash-sans/`, beside the EULA.
