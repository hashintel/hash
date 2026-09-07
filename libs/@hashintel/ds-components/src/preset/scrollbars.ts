/**
 * Scrollbar styling for the design-system preset: native scrollbars inside
 * the theme scope render as a quiet rounded thumb on an invisible track,
 * hidden until the pointer is over the scroll container (every ancestor under
 * the pointer counts as hovered, so the container being scrolled always
 * reveals its own thumb) or while it is being scrolled. On systems that show
 * classic, always-visible scrollbars, the runtime check in
 * `util/use-custom-scrollbar-ui.ts` marks `<html>` with
 * {@link alwaysVisibleScrollbarsClassName} and the thumb stays visible
 * instead, respecting the user's setting; until that check has run, thumbs
 * auto-hide.
 *
 * All of it is inert until that same runtime marks `<html>` with
 * {@link customScrollbarsClassName}: the styling depends on runtime-managed
 * state (the preference class, the scrolling attribute), so an app that never
 * calls `useCustomScrollbarUI` keeps the browser's default scrollbars rather
 * than getting permanently hidden thumbs.
 *
 * This module is deliberately import-free: it is shared by the build-time
 * preset entrypoint and the runtime, and must drag neither `@pandacss/dev`
 * into the component bundle nor React into the preset bundle.
 */

/**
 * Master switch: the scrollbar rules only apply beneath an `<html>` carrying
 * this class, which `applyCustomScrollbarUI` (in
 * `util/use-custom-scrollbar-ui.ts`) adds when an app opts into the custom
 * scrollbar UI. The thin-scrollbar recipe mixin in `util/css-mixins.ts`
 * spells this name out as a literal — keep the two in step.
 */
export const customScrollbarsClassName = "ds-custom-scrollbars";

/**
 * Class the scrollbar-visibility preference check (part of
 * `applyCustomScrollbarUI` in `util/use-custom-scrollbar-ui.ts`) adds to
 * `<html>` when the user's system renders classic, always-visible scrollbars
 * (macOS "Show scroll bars: Always", most Windows setups).
 */
export const alwaysVisibleScrollbarsClassName = "ds-scrollbars-visible";

/**
 * Attribute the scroll-activity tracker (`applyCustomScrollbarUI` in
 * `util/use-custom-scrollbar-ui.ts`) sets on a scroll container while it is
 * being scrolled — by any input: wheel, keyboard, or programmatic. While
 * present, the container's thumb shows in the dark shade, which both gives
 * scrolling feedback and reveals the scrollbar for inputs that never hover
 * the container (keyboard scrolling).
 */
export const scrollingAttribute = "data-ds-scrolling";

const thumbColor = "--ds-scrollbar-thumb";

/**
 * Registered so the thumb reveal can animate: only a registered custom
 * property interpolates in a transition. It must be `inherits: true` — the
 * `::-webkit-scrollbar-thumb` pseudo-element carries no declaration of its
 * own and reads the value from its originating scroll container.
 *
 * Emitted as a raw `@property` rule through `globalCss` rather than Panda's
 * `globalVars`: declaring any global var collapses the generated style-prop
 * types' `var(--…)` escape hatch to just the declared names, which would
 * break every recipe that passes a plain `var(--foo)` value.
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
 * must not reach Chromium or Safari: those take the `::-webkit-scrollbar`
 * path, and an element whose computed `scrollbar-width` is not `auto`
 * ignores `::-webkit-scrollbar-*` styling there.
 *
 * The first arm targets Firefox, gated on `-moz-appearance` support rather
 * than `not selector(::-webkit-scrollbar)` because Firefox parses
 * `::-webkit-*` pseudo-elements as valid selectors and that check would
 * exclude Firefox too. The second arm catches any other engine that styles
 * scrollbars only through the standard properties.
 */
export const standardScrollbarPropertiesGate =
  "@supports (-moz-appearance: none) or ((not selector(::-webkit-scrollbar)) and (scrollbar-width: thin))";

/**
 * Safari does not re-resolve `::-webkit-scrollbar-*` styles when an inherited
 * custom property changes on the scroll container — neither transitioned nor
 * instant flips of `--ds-scrollbar-thumb` reach an already-painted scrollbar
 * (the thumb then only updates when something else happens to repaint it,
 * e.g. the pointer crossing the gutter). Inside this gate the thumb color is
 * therefore expressed as plain hover rules on the pseudo-element itself,
 * which WebKit's own scrollbar hover tracking invalidates reliably; the
 * reveal is instant there rather than faded. `-webkit-hyphens` is parsed by
 * WebKit only (Blink never supported it), so Chromium keeps the animated
 * custom-property route.
 */
const webkitOnlyGate = "@supports (-webkit-hyphens: none)";

/**
 * The scrollbar rules for one theme scope (`scope` when given, the whole
 * document otherwise). Emitted in Panda's `base` layer, so a component
 * recipe (`scrollbarWidth: "[none]"` plus a `display` override on the
 * pseudo-element, ...) still wins where a scrollable opts out.
 *
 * The thumb color routes through `--ds-scrollbar-thumb` because
 * `::-webkit-scrollbar-*` pseudo-elements do not run transitions: the scroll
 * container animates the custom property and the pseudo-element repaints
 * from it each frame. The per-element `transparent` declaration keeps a
 * hovered ancestor's value from bleeding into descendant scrollbars. Safari
 * takes a direct, unanimated route instead — see {@link webkitOnlyGate}.
 */
export const createScrollbarGlobalCss = (scope?: string) => {
  // Every selector requires the runtime's master-switch class on `<html>`.
  // The runtime classes live on `<html>`, which for the unscoped preset is
  // the scope root itself rather than an ancestor of it — hence the two
  // shapes. `:where()` holds each class's specificity contribution at zero,
  // preserving the (0,1,0) per-element defaults vs (0,2,0) hover/scrolling
  // tie-breaking that the rules below rely on.
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
      // A transparent border shrinks the visible thumb to a pill floating in
      // the gutter; `padding-box` keeps the fill from painting under the
      // border.
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
    // Direct WebKit reveal (see `webkitOnlyGate`): a scroll container under
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
    // feedback while scrolling, and the only reveal path for inputs that
    // never hover the container (keyboard scrolling). Declared last so it
    // wins its specificity tie against the hover reveal.
    [scrolling]: {
      [thumbColor]: "token(colors.neutral.a90)",
    },
  };
};
