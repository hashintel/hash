import { CODE_FONT_FAMILY } from "./ui/constants/fonts";

/**
 * Petrinaut's Panda CSS preset — theme extension and `.petrinaut-root`-scoped
 * global styles — shared between:
 *
 * - Petrinaut's own Panda config (`panda.config.shared.ts`), which generates
 *   the package's standalone stylesheet (`dist/main.css`), and
 * - Host applications that compile Petrinaut's styles through their own Panda
 *   pipeline by including `@hashintel/petrinaut/panda.buildinfo.json` (e.g.
 *   the HASH frontend). Without this preset the host's Panda config would not
 *   know about Petrinaut's keyframes and token extensions, and the generated
 *   CSS would silently diverge from what Petrinaut's components expect.
 *
 * Keeping the theme extension in a single importable preset guarantees both
 * generation pipelines compile Petrinaut's style usage against an identical
 * theme contract.
 *
 * All keyframes are namespaced with a `petrinaut` prefix (or an otherwise
 * Petrinaut-specific name) so they can never collide with a host theme's
 * keyframes: Panda deep-merges same-name keyframes across presets, which
 * would otherwise mutate the host's animations (e.g. ds-components' `fadeIn`
 * gaining this package's `translateY`).
 *
 * This is a plain object (rather than `definePreset(...)`), deliberately not
 * typed against `@pandacss/dev`, so that importing it creates no runtime or
 * type-level dependency on Panda's dev tooling (whose types cannot be bundled
 * into this package's `.d.ts` output). Its shape is checked against Panda's
 * `Preset` type where it is consumed in `panda.config.shared.ts`.
 */
export const petrinautPandaPreset = {
  name: "@hashintel/petrinaut/panda-preset",

  /**
   * Native scrollbars inside `.petrinaut-root` render as a quiet rounded
   * thumb on an invisible track. Emitted in Panda's `base` layer, so a
   * component utility (`scrollbarWidth: "[none]"`, a `display` override on
   * the pseudo-element, ...) still wins where a scrollable opts out.
   *
   * Chromium and Safari take the `::-webkit-scrollbar` path. An element
   * whose computed `scrollbar-width`/`scrollbar-color` is not `auto`
   * ignores `::-webkit-scrollbar-*` styling in those engines, so the
   * standard-property fallback for Firefox must not reach them. It is
   * gated on `-moz-appearance` support rather than
   * `@supports not selector(::-webkit-scrollbar)`, because Firefox parses
   * `::-webkit-*` pseudo-elements as valid selectors and that check would
   * exclude Firefox too.
   */
  globalCss: {
    ".petrinaut-root ::-webkit-scrollbar": {
      width: "10px",
      height: "10px",
      background: "transparent",
    },
    ".petrinaut-root ::-webkit-scrollbar-track": {
      background: "transparent",
    },
    ".petrinaut-root ::-webkit-scrollbar-corner": {
      background: "transparent",
    },
    ".petrinaut-root ::-webkit-scrollbar-button": {
      display: "none",
    },
    ".petrinaut-root ::-webkit-scrollbar-thumb": {
      backgroundColor: "neutral.a70",
      // A transparent border shrinks the visible thumb to a 6px pill
      // floating in the 10px gutter; `padding-box` keeps the fill from
      // painting under the border.
      backgroundClip: "padding-box",
      border: "2px solid transparent",
      borderRadius: "9999px",
    },
    ".petrinaut-root ::-webkit-scrollbar-thumb:hover": {
      backgroundColor: "neutral.a90",
    },
    ".petrinaut-root, .petrinaut-root *": {
      "@supports (-moz-appearance: none)": {
        scrollbarWidth: "thin",
        scrollbarColor: "token(colors.neutral.a70) transparent",
      },
    },
  },

  theme: {
    extend: {
      tokens: {
        fonts: {
          mono: {
            value: CODE_FONT_FAMILY,
          },
        },
      },
      keyframes: {
        petrinautFadeIn: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        petrinautFadeOut: {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-10px)" },
        },
        optimizationGlow: {
          "0%, 100%": {
            boxShadow:
              "-2px 0 6px rgba(0, 220, 255, 0.03), 2px 0 6px rgba(255, 0, 128, 0.045)",
          },
          "25%": {
            boxShadow:
              "0 -2px 6px rgba(0, 220, 255, 0.03), 0 2px 6px rgba(255, 0, 128, 0.045)",
          },
          "50%": {
            boxShadow:
              "2px 0 6px rgba(0, 220, 255, 0.03), -2px 0 6px rgba(255, 0, 128, 0.045)",
          },
          "75%": {
            boxShadow:
              "0 2px 6px rgba(0, 220, 255, 0.03), 0 -2px 6px rgba(255, 0, 128, 0.045)",
          },
        },
        petrinautExpand: {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--height)", opacity: "1" },
        },
        petrinautCollapse: {
          from: { height: "var(--height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        dialogBackdropIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        dialogBackdropOut: {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        dialogContentIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        dialogContentOut: {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.95)" },
        },
        "popover-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "popover-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.96)" },
        },
        "drawer-in": {
          from: { opacity: "0", transform: "translateX(100px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "drawer-out": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(100px)" },
        },
      },
    },
  },
};

export default petrinautPandaPreset;
