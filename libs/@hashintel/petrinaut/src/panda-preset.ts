import { CODE_FONT_FAMILY } from "./ui/constants/fonts";

/**
 * Petrinaut's Panda CSS theme extension, shared between:
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
        petriconRunnerBob: {
          "0%, 50%, 100%": { transform: "translateY(0)" },
          "25%, 75%": { transform: "translateY(-0.7px)" },
        },
        petriconRunnerBackArm: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(-100deg)" },
        },
        petriconRunnerFrontArm: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(100deg)" },
        },
        petriconRunnerBackLeg: {
          "0%, 100%": { d: 'path("M10 15L6 19L2 19")' },
          "25%": { d: 'path("M10 15L6 16L5 12")' },
          "50%": { d: 'path("M10 15L15 18L14 22")' },
          "75%": { d: 'path("M10 15L10 20L6 22")' },
        },
        petriconRunnerFrontLeg: {
          "0%, 100%": { d: 'path("M10 15L15 18L14 22")' },
          "25%": { d: 'path("M10 15L10 20L6 22")' },
          "50%": { d: 'path("M10 15L6 19L2 19")' },
          "75%": { d: 'path("M10 15L6 16L5 12")' },
        },
        petriconSequence: {
          "0%, 100%": { transform: "translateY(0)", opacity: "1" },
          "40%": { transform: "translateY(-1px)", opacity: "0.72" },
        },
        petriconNotation: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "35%": { transform: "translate(1px, -0.5px)" },
          "70%": { transform: "translate(-0.4px, 0.2px)" },
        },
        petriconSignal: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "35%": { transform: "scale(0.9)", opacity: "0.65" },
          "65%": { transform: "scale(1.04)", opacity: "1" },
        },
        petriconDistribution: {
          "0%, 100%": { transform: "translateX(0) skewX(0)" },
          "30%": { transform: "translateX(-0.5px) skewX(-5deg)" },
          "65%": { transform: "translateX(0.3px) skewX(3deg)" },
        },
        petriconOrbit: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "40%": { transform: "rotate(14deg)" },
          "75%": { transform: "rotate(-3deg)" },
        },
        petriconBlink: {
          "0%, 100%": { transform: "scaleY(1)" },
          "40%": { transform: "scaleY(0.2)" },
        },
        petriconScan: {
          "0%, 100%": { transform: "scaleY(1)", opacity: "1" },
          "45%": { transform: "scaleY(0.8)", opacity: "0.5" },
        },
        petrinautIconParameterScrub: {
          "0%, 100%": { transform: "translateX(0)" },
          "30%": {
            transform:
              "translateX(calc(var(--parameter-scrub-direction) * 3px))",
          },
          "65%": {
            transform:
              "translateX(calc(var(--parameter-scrub-direction) * -1px))",
          },
        },
        petrinautIconLiquidWave: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(1px, -0.5px)" },
          "65%": { transform: "translate(-0.5px, 0)" },
        },
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
        /**
         * Breathing purple glow for the GPU side of the experiment backend
         * toggle. Both steps repeat the control's inset shadows, because
         * animating `box-shadow` replaces the whole property and the depth
         * would otherwise vanish for the duration.
         */
        petrinautGpuGlow: {
          "0%, 100%": {
            boxShadow:
              "inset 0 2px 4px rgba(0, 0, 0, 0.05), inset 0 0 0 1px var(--colors-black-a10), 0 0 5px var(--colors-purple-a30), 0 0 11px var(--colors-purple-a15)",
          },
          "50%": {
            boxShadow:
              "inset 0 2px 4px rgba(0, 0, 0, 0.05), inset 0 0 0 1px var(--colors-black-a10), 0 0 9px var(--colors-purple-a50), 0 0 20px var(--colors-purple-a30)",
          },
        },
        /**
         * The halo breathing around a card whose controls an optimizer
         * drives: a pseudo-element carrying the peak shadow, its opacity
         * alone animating, over the card's own static ring.
         */
        petrinautOptimizingGlow: {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "1" },
        },
        /**
         * The fade at the end of a line of chips that scrolls sideways,
         * driven by the line's own scroll position: the mask holds until the
         * last stretch and lifts at the end of the scroll range.
         */
        petrinautScrollEndFade: {
          "0%, 85%": {
            maskImage:
              "linear-gradient(to right, black calc(100% - 40px), transparent 100%)",
          },
          "100%": {
            maskImage:
              "linear-gradient(to right, black 100%, transparent 100%)",
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
        petrinautVoiceSwap: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        petrinautComposerActionSwap: {
          from: { opacity: "0", transform: "scale(0.7)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
};

export default petrinautPandaPreset;
