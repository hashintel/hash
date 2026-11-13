import { css, cva } from "@hashintel/ds-helpers/css";

import { CODE_FONT_FAMILY } from "../../../../../constants/ui";
import { themePreview } from "./code-editor-theme-picker/theme-preview";

import type { RegisteredCodeEditorTheme } from "../../../../../monaco/code-editor-themes";
import type { AriaAttributes, KeyboardEvent } from "react";

const pickerStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "4",
  paddingTop: "2",
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  minWidth: "0",
});

const builtInGroupStyle = css({ flex: "[1 1 0]", minWidth: "[124px]" });

const groupLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
});

const dividerStyle = css({
  alignSelf: "stretch",
  width: "[1px]",
  marginTop: "6",
  marginBottom: "6",
  background: "neutral.s40",
});

const cardsStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(auto-fill, minmax(116px, 1fr))]",
  gap: "3",
});

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "1.5",
  width: "full",
  padding: "0",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  outline: "none",
  textAlign: "center",
  // Hover and focus rings skip the selected preview, so its ring holds under
  // the pointer and under keyboard focus.
  "&:hover > [data-preview]:not([data-selected])": {
    boxShadow: "[0 0 0 1px {colors.neutral.a50}, 0 1px 3px rgba(0, 0, 0, 0.1)]",
  },
  "&:focus-visible > [data-preview]:not([data-selected])": {
    boxShadow: "[0 0 0 2px {colors.neutral.s00}, 0 0 0 4px {colors.blue.s70}]",
  },
});

const defaultGroupStyle = css({ width: "[116px]", flexShrink: "0" });

const previewStyle = css({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "[1fr auto auto]",
  gridTemplateRows: "[auto auto]",
  alignItems: "center",
  columnGap: "1.5",
  rowGap: "2",
  height: "[64px]",
  paddingX: "2.5",
  paddingY: "2",
  borderRadius: "xl",
  boxShadow: "[0 0 0 1px {colors.neutral.a30}, 0 1px 2px rgba(0, 0, 0, 0.06)]",
  transition: "[box-shadow 140ms ease]",
  "&[data-selected]": {
    boxShadow: "[0 0 0 2px {colors.neutral.s00}, 0 0 0 4px {colors.blue.s90}]",
  },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

const sampleStyle = css({
  fontSize: "[22px]",
  lineHeight: "[1]",
  fontWeight: "normal",
  letterSpacing: "[-0.01em]",
});

const chipStyle = css({
  paddingX: "1",
  paddingY: "0.5",
  borderRadius: "sm",
  fontSize: "[11px]",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
});

const caretStyle = css({
  width: "[5px]",
  height: "[18px]",
  borderRadius: "[2px]",
});

const swatchesStyle = css({
  gridColumn: "[1 / -1]",
  display: "flex",
  paddingLeft: "[3px]",
});

const swatchStyle = css({
  width: "[13px]",
  height: "[13px]",
  borderRadius: "full",
  marginLeft: "[-3px]",
});

const nameStyle = cva({
  base: {
    fontSize: "xs",
    lineHeight: "[1.3]",
    color: "neutral.fg.body",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  variants: {
    selected: {
      true: { color: "neutral.fg.heading", fontWeight: "semibold" },
      false: {},
    },
  },
});

const ThemeCard = ({
  theme,
  selected,
  onSelect,
}: {
  theme: RegisteredCodeEditorTheme;
  selected: boolean;
  onSelect: () => void;
}) => {
  const preview = themePreview(theme);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={theme.label}
      tabIndex={selected ? 0 : -1}
      data-theme-id={theme.id}
      className={cardStyle}
      onClick={onSelect}
    >
      <span
        aria-hidden
        data-preview
        data-selected={selected || undefined}
        className={previewStyle}
        style={{ background: preview.surface, color: preview.ink }}
      >
        <span className={sampleStyle}>Aa</span>
        <span
          className={chipStyle}
          style={{
            background: preview.ink,
            color: preview.surface,
            fontFamily: CODE_FONT_FAMILY,
          }}
        >
          {"{}"}
        </span>
        <span className={caretStyle} style={{ background: preview.accent }} />
        <span className={swatchesStyle}>
          {preview.swatches.map((color) => (
            <span
              key={color}
              className={swatchStyle}
              style={{
                background: color,
                boxShadow: `0 0 0 1.5px ${preview.surface}`,
              }}
            />
          ))}
        </span>
      </span>
      <span className={nameStyle({ selected })}>{theme.label}</span>
    </button>
  );
};

const stepKeys: Partial<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * The code editor themes as preview cards, one radio group. The first theme
 * is the default and sits apart; the rest wrap as the dialog narrows. Left
 * and Right, Home and End move the selection; Up and Down stay with the
 * settings rows.
 */
export const CodeEditorThemePicker = ({
  themes,
  value,
  onChange,
  ...aria
}: {
  themes: readonly RegisteredCodeEditorTheme[];
  value: string;
  onChange: (themeId: string) => void;
} & AriaAttributes) => {
  const [defaultTheme, ...builtInThemes] = themes;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = stepKeys[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const index = themes.findIndex((theme) => theme.id === value);
    const next = themes[step(Math.max(index, 0), themes.length)];
    if (!next) {
      return;
    }
    event.preventDefault();
    onChange(next.id);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-theme-id="${next.id}"]`)
      ?.focus();
  };

  return (
    <div
      role="radiogroup"
      {...aria}
      // The selected card is the Tab stop; the group takes focus only from code.
      tabIndex={-1}
      className={pickerStyle}
      onKeyDown={handleKeyDown}
    >
      {defaultTheme && (
        <div className={`${groupStyle} ${defaultGroupStyle}`}>
          <span className={groupLabelStyle}>Default</span>
          <ThemeCard
            theme={defaultTheme}
            selected={defaultTheme.id === value}
            onSelect={() => onChange(defaultTheme.id)}
          />
        </div>
      )}
      {builtInThemes.length > 0 && (
        <>
          <span aria-hidden className={dividerStyle} />
          <div className={`${groupStyle} ${builtInGroupStyle}`}>
            <span className={groupLabelStyle}>Built-in</span>
            <div className={cardsStyle}>
              {builtInThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === value}
                  onSelect={() => onChange(theme.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
