/**
 * Custom scrollbar styling for the design-system preset.
 * These are only applied if useCustomScrollbarUI is called, otherwise browser defaults are used.
 *
 * The custom scrollbar is slighly thinner and lighter than the defaults in many browsers/os's
 * and it respects a users system scrollbar visibility choice, but in addition shows a subtle bar
 * on hover if the user has opted in to auto-hide scrollbars.
 *
 * This module is deliberately import-free: it is shared by the build-time
 * preset entrypoint and the runtime, and must drag neither `@pandacss/dev`
 * into the component bundle nor React into the preset bundle.
 */

export const customScrollbarsClassName = "ds-custom-scrollbars";
export const alwaysVisibleScrollbarsClassName = "ds-scrollbars-visible";
export const scrollingAttribute = "data-ds-scrolling";

const thumbColor = "--ds-scrollbar-thumb";

/**
 * Registered so the thumb reveal can animate: only a registered custom
 * property interpolates in a transition. It must be `inherits: true` — the
 * `::-webkit-scrollbar-thumb` pseudo-element carries no declaration of its
 * own and reads the value from its originating scroll container.
 */
export const scrollbarPropertyRegistration = {
  [`@property ${thumbColor}`]: {
    syntax: '"<color>"',
    inherits: "true",
    initialValue: "transparent",
  },
} as const;

/**
 * Gate for the standard `scrollbar-width`/`scrollbar-color` fallback, which
 * must not reach Chromium or Safari
 *
 * The first arm targets Firefox, gated on `-moz-appearance`, The second arm
 * catches any other engine that styles scrollbars only through the standard properties.
 */
export const standardScrollbarPropertiesGate =
  "@supports (-moz-appearance: none) or ((not selector(::-webkit-scrollbar)) and (scrollbar-width: thin))";

/**
 * Safari does not re-resolve `::-webkit-scrollbar-*` styles when an inherited
 * custom property changes on the scroll container
 *
 * The positive arms — `-webkit-hyphens` (all WebKit ports) and
 * `-webkit-touch-callout` (Apple ports) — are unsupported in Blink as of
 * Chrome 152, but Blink keeps growing `-webkit-*` compat aliases, so the
 * gate also requires NOT parsing `-webkit-app-region`: a Blink-only property
 * that shipped Chromium features (window-controls-overlay, Electron drag
 * regions) depend on, and which WebKit has never implemented. A hypothetical
 * Blink that both aliases the positive arms and drops `-webkit-app-region`
 * would merely lose the fade (instant reveal), not correctness.
 */
const webkitOnlyGate =
  "@supports ((-webkit-hyphens: none) or (-webkit-touch-callout: none)) and (not (-webkit-app-region: drag))";

/**
 * The scrollbar rules for one theme scope emitted in Panda's `base` layer,
 * so a component recipe (`scrollbarWidth: "[none]"` plus a `display` override
 * on the pseudo-element, ...) still wins where a scrollable opts out.
 */
export const createScrollbarGlobalCss = (scope?: string) => {
  // Every selector requires the runtime's master-switch class on `<html>`.
  // The runtime classes live on `<html>`, which for the unscoped preset is
  // the scope root itself rather than an ancestor of it — hence the two
  // shapes.
  const inScope = scope
    ? `:where(:root.${customScrollbarsClassName}) :is(${scope}, ${scope} *)`
    : `:is(:root, :root *):where(:root.${customScrollbarsClassName}, :root.${customScrollbarsClassName} *)`;

  const bothClasses = `${customScrollbarsClassName}.${alwaysVisibleScrollbarsClassName}`;
  const alwaysVisible = scope
    ? `:where(:root.${bothClasses}) :is(${scope}, ${scope} *)`
    : `:is(:root, :root *):where(:root.${bothClasses}, :root.${bothClasses} *)`;

  const scrolling = `${inScope}[${scrollingAttribute}]`;

  return {
    [`${inScope}::-webkit-scrollbar`]: {
      width: "10px",
      height: "10px",
      background: "transparent",
    },
    [`${inScope}::-webkit-scrollbar-track`]: {
      background: "transparent",
    },
    [`${inScope}::-webkit-scrollbar-corner`]: {
      background: "transparent",
    },
    [`${inScope}::-webkit-scrollbar-button`]: {
      display: "none",
    },
    [`${inScope}::-webkit-scrollbar-thumb`]: {
      backgroundColor: `var(${thumbColor})`,
      backgroundClip: "padding-box",
      border: "2px solid transparent",
      borderRadius: "9999px",
      [webkitOnlyGate]: {
        backgroundColor: "transparent",
      },
    },
    // The always-visible counterpart of the direct WebKit rules below,
    // overriding the per-element transparent default by source order.
    [`${alwaysVisible}::-webkit-scrollbar-thumb`]: {
      [webkitOnlyGate]: {
        backgroundColor: "token(colors.neutral.a70)",
      },
    },
    // Direct WebKit reveal: a scroll container under
    // the pointer is `:hover` itself, so this colors exactly the scrollbars
    // the custom-property route reveals elsewhere. Declared before the
    // scrolling and `:hover`/`:active` thumb rules so those win their
    // specificity ties and the darker shade still applies.
    [`${inScope}:hover::-webkit-scrollbar-thumb`]: {
      [webkitOnlyGate]: {
        backgroundColor: "token(colors.neutral.a70)",
      },
    },
    [`${scrolling}::-webkit-scrollbar-thumb`]: {
      [webkitOnlyGate]: {
        backgroundColor: "token(colors.neutral.a90)",
      },
    },
    [`${inScope}::-webkit-scrollbar-thumb:hover`]: {
      backgroundColor: "neutral.a90",
    },
    // Keeps the thumb visible while it is being dragged, even when the
    // pointer strays off the scroll container mid-drag.
    [`${inScope}::-webkit-scrollbar-thumb:active`]: {
      backgroundColor: "neutral.a90",
    },
    [inScope]: {
      [thumbColor]: "transparent",
      transition: `${thumbColor} 200ms ease`,
      [standardScrollbarPropertiesGate]: {
        scrollbarWidth: "thin",
        scrollbarColor: `var(${thumbColor}) transparent`,
      },
    },
    [`${inScope}:hover`]: {
      [thumbColor]: "token(colors.neutral.a70)",
    },
    [alwaysVisible]: {
      [thumbColor]: "token(colors.neutral.a70)",
    },
    // While a container is being scrolled its thumb shows in the dark shade —
    // feedback while scrolling. Declared last so it wins its specificity tie
    // against the hover reveal.
    [scrolling]: {
      [thumbColor]: "token(colors.neutral.a90)",
    },
  };
};
