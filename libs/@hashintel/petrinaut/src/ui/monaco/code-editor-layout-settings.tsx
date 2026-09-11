import { use } from "react";

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../react/state/user-settings-context";

const layouts = [
  {
    value: "fullscreen",
    label: "Full screen",
    description: "Replace the canvas",
  },
  {
    value: "properties",
    label: "Properties panel",
    description: "Keep the canvas beside code",
  },
  {
    value: "bottom",
    label: "Bottom dock",
    description: "Keep the canvas above code",
  },
] as const;

const headingStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  gap: "2",
});
const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
  marginTop: "1",
  marginBottom: "3",
  lineHeight: "[1.5]",
});
const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
  gap: "2",
  marginBottom: "3",
});
const cardStyle = css({
  padding: "2",
  borderWidth: "thin",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  textAlign: "left",
  cursor: "pointer",
  background: "neutral.s00",
  fontSize: "xs",
  color: "neutral.fg.heading",
  _hover: { background: "bg.subtle" },
  _focusVisible: { outline: "[2px solid #2563eb]", outlineOffset: "[2px]" },
  "&[aria-pressed=true]": { borderColor: "[#3b82f6]", background: "[#eff6ff]" },
});
const previewStyle = css({
  height: "[60px]",
  position: "relative",
  overflow: "hidden",
  borderRadius: "sm",
  borderWidth: "thin",
  borderColor: "neutral.bd.subtle",
  background: "[#f5f6f8]",
  marginBottom: "2",
});
const barStyle = css({
  position: "absolute",
  inset: "[0 0 auto]",
  height: "[7px]",
  background: "[#e2e5eb]",
});
const sidebarStyle = css({
  position: "absolute",
  top: "[7px]",
  bottom: "[0]",
  width: "[16%]",
  borderRight: "[1px solid #e2e5eb]",
  background: "neutral.s00",
});
const codeStyle = css({
  position: "absolute",
  padding: "[4px]",
  background: "neutral.s00",
  border: "[1px solid #c6d9fa]",
  color: "[#4d7cc0]",
  fontSize: "[8px]",
  lineHeight: "[9px]",
  fontFamily: "[monospace]",
  whiteSpace: "pre",
  overflow: "hidden",
});
const labelStyle = css({ fontWeight: "medium", lineHeight: "[1.3]" });

export const CodeEditorLayoutSettings = () => {
  const {
    enableCodeEditorWorkspace,
    setEnableCodeEditorWorkspace,
    codeEditorPlacement,
    setCodeEditorPlacement,
  } = use(UserSettingsContext);
  return (
    <>
      <div className={headingStyle}>
        <span>Code editor layouts</span>
        <Toggle
          aria-label="Code editor layouts"
          size="sm"
          value={enableCodeEditorWorkspace}
          onChange={setEnableCodeEditorWorkspace}
        />
      </div>
      <p className={descriptionStyle}>
        Open code directly from a field’s menu or the canvas Code menu. Choose
        where it opens.
      </p>
      <div className={gridStyle} aria-label="Default code editor layout">
        {layouts.map((layout) => (
          <button
            key={layout.value}
            type="button"
            className={cardStyle}
            aria-pressed={
              enableCodeEditorWorkspace && codeEditorPlacement === layout.value
            }
            title={layout.description}
            onClick={() => {
              setCodeEditorPlacement(layout.value);
              setEnableCodeEditorWorkspace(true);
            }}
          >
            <div className={previewStyle} aria-hidden="true">
              <div className={barStyle} />
              <div className={sidebarStyle} />
              <div
                className={codeStyle}
                style={{
                  top: layout.value === "bottom" ? "45%" : 7,
                  bottom: 0,
                  left: layout.value === "properties" ? "50%" : "16%",
                  right: 0,
                }}
              >
                {"λ function\n  return {\n    tokens\n  }"}
              </div>
            </div>
            <span className={labelStyle}>{layout.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};
