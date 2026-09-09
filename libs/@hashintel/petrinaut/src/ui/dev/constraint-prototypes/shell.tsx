/**
 * Shared chrome for the constraint prototypes: the page shell with an
 * explainer, labelled control rows, sliders, stat chips, and the constraint
 * input (a single-line Monaco editor with parse feedback and a live margin
 * badge). Everything is controlled by the hosting story.
 */

import { css, cx } from "@hashintel/ds-helpers/css";

import { CodeEditor } from "../../monaco/code-editor";
import { ExprError, parseExpression } from "./expr";

import type { ExprNode } from "./expr";

const shellStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  maxWidth: "[880px]",
  color: "neutral.s110",
});

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
});

const explainerStyle = css({
  fontSize: "sm",
  color: "neutral.s90",
  lineHeight: "[1.5]",
  maxWidth: "[72ch]",
  whiteSpace: "pre-line",
});

const sectionTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s90",
  marginTop: "2",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexWrap: "wrap",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

export const PrototypeShell = ({
  title,
  explainer,
  children,
}: {
  title: string;
  explainer: string;
  children: React.ReactNode;
}) => (
  <div className={shellStyle}>
    <div className={titleStyle}>{title}</div>
    <p className={explainerStyle}>{explainer}</p>
    {children}
  </div>
);

export const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className={columnStyle}>
    <div className={sectionTitleStyle}>{title}</div>
    {children}
  </div>
);

export const Row = ({ children }: { children: React.ReactNode }) => (
  <div className={rowStyle}>{children}</div>
);

const sliderLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s90",
});

const sliderValueStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  minWidth: "[44px]",
  textAlign: "right",
});

function formatValue(value: number): string {
  return Math.abs(value) >= 100
    ? value.toFixed(0)
    : String(Math.round(value * 100) / 100);
}

export const Slider = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) => (
  <label className={sliderLabelStyle}>
    <span>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step ?? (max - min) / 100}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <span className={sliderValueStyle}>{formatValue(value)}</span>
  </label>
);

const statStyle = css({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "1.5",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "sm",
  border: "1px solid",
  borderColor: "neutral.a45",
  backgroundColor: "neutral.s05",
  fontSize: "xs",
  color: "neutral.s90",
});

const statValueStyle = css({
  fontFamily: "mono",
  fontSize: "sm",
  color: "neutral.s110",
});

const goodStyle = css({ color: "green.s100!" });
const badStyle = css({ color: "red.s105!" });

export const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) => (
  <span className={statStyle}>
    <span>{label}</span>
    <span
      className={cx(
        statValueStyle,
        tone === "good" && goodStyle,
        tone === "bad" && badStyle,
      )}
    >
      {value}
    </span>
  </span>
);

const editorRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  "& > :first-child": {
    flex: "[1]",
    minWidth: "0",
  },
});

const errorStyle = css({
  fontSize: "xs",
  color: "red.s105",
  fontFamily: "mono",
});

export type ParsedConstraint =
  | { ok: true; node: ExprNode }
  | { ok: false; error: string };

/** Parses a source string into a prototype constraint, error as data. */
export function parseConstraint(source: string): ParsedConstraint {
  try {
    return { ok: true, node: parseExpression(source) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ExprError ? error.message : String(error),
    };
  }
}

/**
 * The prototypes' expression input: a single-line editor, a slot for the
 * live verdict beside it, and the parse error underneath.
 */
export const ConstraintInput = ({
  path,
  value,
  onChange,
  error,
  after,
}: {
  /** Unique Monaco model path for this input. */
  path: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  after?: React.ReactNode;
}) => (
  <div className={columnStyle}>
    <div className={editorRowStyle}>
      <CodeEditor
        language="typescript"
        singleLine
        path={path}
        value={value}
        hasError={error !== undefined}
        onChange={(next) => onChange(next ?? "")}
      />
      {after}
    </div>
    {error === undefined ? null : <div className={errorStyle}>{error}</div>}
  </div>
);
