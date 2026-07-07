import { Suspense, use, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { compileUserCode } from "@hashintel/petrinaut-core";

import { SegmentGroup } from "../../components/segment-group";
import { CodeEditor } from "../../monaco/code-editor";
import { MonacoContext } from "../../monaco/context";
import { DimensionEditor } from "./dimension-editor";
import { computeTokenLayout, encodeToken } from "./physical-layout";
import {
  disableTypescriptLanguageService,
  enableTypescriptLanguageService,
  encodableDimensions,
  generateTokenDefs,
  setPlaygroundTokenDefs,
} from "./playground-monaco";
import { TokenMemoryView } from "./token-memory-view";

import type {
  EncodedToken,
  LayoutMode,
  PlaygroundDimension,
  TokenLayout,
} from "./physical-layout";
import type { BitOrder } from "./token-memory-view";

const DEFAULT_DIMENSIONS: PlaygroundDimension[] = [
  { name: "amount", type: "real" },
  { name: "count", type: "integer" },
  { name: "active", type: "boolean" },
];

const DEFAULT_CODE = `export default Token(() => ({
  amount: 1.25,
  count: 2.7,
  active: true,
}));
`;

type EvaluationResult =
  | {
      ok: true;
      layout: TokenLayout;
      encoded: EncodedToken;
      input: Record<string, unknown>;
    }
  | { ok: false; error: string };

function evaluate(
  code: string,
  dimensions: PlaygroundDimension[],
  mode: LayoutMode,
): EvaluationResult {
  try {
    const layout = computeTokenLayout(dimensions, mode);
    // Same pipeline user code takes in the product (Babel TS-strip + eval).
    const create = compileUserCode<[]>(code, "Token");
    const raw: unknown = create();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("Token(() => …) must return an object");
    }
    const input = raw as Record<string, unknown>;
    return { ok: true, layout, encoded: encodeToken(layout, input), input };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// -- Styles ---------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
});

const topRowStyle = css({
  display: "flex",
  gap: "4",
  alignItems: "stretch",
});

const paneStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const dimensionsPaneStyle = css({
  width: "[300px]",
  flexShrink: 0,
});

const editorPaneStyle = css({
  flex: "[1]",
  minWidth: "[0]",
});

const paneTitleStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s90",
  textTransform: "uppercase",
  letterSpacing: "[0.05em]",
});

const togglesStyle = css({
  display: "flex",
  gap: "4",
  alignItems: "center",
  flexWrap: "wrap",
});

const errorStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  color: "red.s105",
  background: "red.a25",
  borderRadius: "sm",
  padding: "2",
  whiteSpace: "pre-wrap",
});

const editorFallbackStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  padding: "2",
});

// -- Editor (needs Monaco context resolved before mounting) -----------------

const PlaygroundEditor: React.FC<{
  code: string;
  onChange: (code: string) => void;
  defs: string;
}> = ({ code, onChange, defs }) => {
  // Suspends until MonacoProvider's init has run — required so the worker
  // environment patch below lands after the provider's assignment.
  const { monaco } = use(use(MonacoContext));
  // Both calls are idempotent and MUST run before the editor's `typescript`
  // model is created below (worker routing + extra libs).
  enableTypescriptLanguageService();
  setPlaygroundTokenDefs(defs);

  // The built-in TS service is playground-scoped: it must not shadow the
  // SDCPN LSP in the product's editors, so re-enable after StrictMode
  // remounts and switch it off (clearing its markers) on unmount.
  useEffect(() => {
    enableTypescriptLanguageService();
    return () => disableTypescriptLanguageService(monaco);
  }, [monaco]);

  return (
    <CodeEditor
      height={200}
      defaultLanguage="typescript"
      path="file:///playground/token.ts"
      value={code}
      onChange={(next) => onChange(next ?? "")}
      options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
    />
  );
};

// -- Playground -------------------------------------------------------------

/**
 * Dev-only playground: define a colour's dimensions, author a token value,
 * and inspect the exact bits the simulation buffer would hold — in the
 * shipped v1 encoding (uniform f64 slots) or the planned v2 packed layout.
 */
export const TokenEncodingPlayground: React.FC = () => {
  const [dimensions, setDimensions] =
    useState<PlaygroundDimension[]>(DEFAULT_DIMENSIONS);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("v1");
  const [bitOrder, setBitOrder] = useState<BitOrder>("logical");
  const [result, setResult] = useState<EvaluationResult | null>(null);

  // The layout and the generated Token type must be built from the SAME
  // dimension list: invalid identifiers and duplicate names are dropped from
  // the type, so they must not occupy slots in the memory view either.
  const effectiveDimensions = encodableDimensions(dimensions);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Filter inside the effect: depending on a derived array would rerun
      // the debounce whenever the reference changes rather than the data.
      setResult(evaluate(code, encodableDimensions(dimensions), layoutMode));
    }, 250);
    return () => clearTimeout(timer);
  }, [code, dimensions, layoutMode]);

  return (
    <div className={containerStyle}>
      <div className={topRowStyle}>
        <div className={`${paneStyle} ${dimensionsPaneStyle}`}>
          <span className={paneTitleStyle}>Dimensions</span>
          <DimensionEditor dimensions={dimensions} onChange={setDimensions} />
        </div>
        <div className={`${paneStyle} ${editorPaneStyle}`}>
          <span className={paneTitleStyle}>Token value</span>
          <Suspense
            fallback={
              <div className={editorFallbackStyle}>Loading editor…</div>
            }
          >
            <PlaygroundEditor
              code={code}
              onChange={setCode}
              defs={generateTokenDefs(effectiveDimensions)}
            />
          </Suspense>
        </div>
      </div>

      <div className={togglesStyle}>
        <SegmentGroup
          size="sm"
          value={layoutMode}
          onChange={(value) => setLayoutMode(value as LayoutMode)}
          options={[
            { value: "v1", label: "v1 — uniform f64 (shipped)" },
            { value: "v2", label: "v2 — packed struct (planned)" },
          ]}
        />
        <SegmentGroup
          size="sm"
          value={bitOrder}
          onChange={(value) => setBitOrder(value as BitOrder)}
          options={[
            { value: "logical", label: "Logical bits (MSB→LSB)" },
            { value: "memory", label: "Memory bytes (little-endian)" },
          ]}
        />
      </div>

      <div className={paneStyle}>
        <span className={paneTitleStyle}>Encoded token memory</span>
        {result === null ? null : result.ok ? (
          <TokenMemoryView
            layout={result.layout}
            buffer={result.encoded.buffer}
            input={result.input}
            stored={result.encoded.stored}
            decoded={result.encoded.decoded}
            bitOrder={bitOrder}
          />
        ) : (
          <div className={errorStyle}>{result.error}</div>
        )}
      </div>
    </div>
  );
};
