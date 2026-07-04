import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  emitBufferDynamicsJs,
  emitBufferKernelJs,
  emitBufferLambdaJs,
  emitUserFunctionJs,
  formatHirType,
  lintHirUserCode,
} from "@hashintel/petrinaut-core/hir";

import { CodeEditor } from "./monaco/code-editor";
import { MonacoProvider } from "./monaco/provider";

import type {
  HirAnalysis,
  HirDiagnostic,
  HirFunction,
  HirSurfaceContext,
  HirSurfaceKind,
  HirTokenElementInfo,
  HirTypecheckResult,
} from "@hashintel/petrinaut-core/hir";
import type { Meta, StoryObj } from "@storybook/react-vite";

// -- Playground schema (hand-editable, derives the HirSurfaceContext) ---------

type PlaygroundPlace = {
  name: string;
  tokenCount: number;
  elements: HirTokenElementInfo[];
};

type PlaygroundSchema = {
  parameters: { name: string; type: "real" | "integer" | "boolean" }[];
  /** Attributes of the colour a dynamics equation is attached to. */
  elements: HirTokenElementInfo[];
  /** Colored input places, in arc order (lambda/kernel). */
  inputPlaces: PlaygroundPlace[];
  /** Colored output places, in arc order (kernel). */
  outputPlaces: PlaygroundPlace[];
  lambdaType: "stochastic" | "predicate";
  stochasticity: boolean;
};

function toArcSlots(places: PlaygroundPlace[]) {
  let slotStart = 0;
  return places.map((place, index) => {
    const slot = {
      name: place.name,
      colorId: `color-${index}`,
      elements: place.elements,
      tokenCount: place.tokenCount,
      slotStart,
    };
    slotStart += place.tokenCount;
    return slot;
  });
}

function toContext(
  surface: HirSurfaceKind,
  schema: PlaygroundSchema,
): HirSurfaceContext {
  switch (surface) {
    case "dynamics":
      return {
        surface,
        parameters: schema.parameters,
        elements: schema.elements,
      };
    case "lambda":
      return {
        surface,
        parameters: schema.parameters,
        inputPlaces: toArcSlots(schema.inputPlaces),
        inputSlots: toArcSlots(schema.inputPlaces),
        lambdaType: schema.lambdaType,
      };
    case "kernel":
      return {
        surface,
        parameters: schema.parameters,
        inputPlaces: toArcSlots(schema.inputPlaces),
        inputSlots: toArcSlots(schema.inputPlaces),
        outputPlaces: toArcSlots(schema.outputPlaces),
        outputSlots: toArcSlots(schema.outputPlaces),
        stochasticity: schema.stochasticity,
      };
  }
}

// -- Presets -------------------------------------------------------------------

const DEFAULT_SCHEMA: PlaygroundSchema = {
  parameters: [
    { name: "k", type: "real" },
    { name: "rate", type: "real" },
    { name: "sigma", type: "real" },
    { name: "threshold", type: "real" },
  ],
  elements: [
    { name: "x", type: "real" },
    { name: "v", type: "real" },
    { name: "generation", type: "integer" },
    { name: "alive", type: "boolean" },
  ],
  inputPlaces: [
    {
      name: "Pool",
      tokenCount: 2,
      elements: [
        { name: "x", type: "real" },
        { name: "v", type: "real" },
        { name: "alive", type: "boolean" },
      ],
    },
    {
      name: "Fuel",
      tokenCount: 1,
      elements: [{ name: "level", type: "real" }],
    },
  ],
  outputPlaces: [
    {
      name: "Out",
      tokenCount: 1,
      elements: [
        { name: "x", type: "real" },
        { name: "generation", type: "integer" },
        { name: "alive", type: "boolean" },
      ],
    },
  ],
  lambdaType: "stochastic",
  stochasticity: true,
};

const CODE_PRESETS: Record<HirSurfaceKind, string> = {
  dynamics: `export default Dynamics((tokens, parameters) => {
  const stiffness = parameters.k;

  return tokens.map(({ x, v, alive }) => {
    return {
      x: alive ? v : 0,
      v: -stiffness * x,
    };
  });
});
`,
  lambda: `export default Lambda((input, parameters) => {
  const { rate, threshold } = parameters;
  const { x, alive } = input.Pool[0];

  if (!alive) return 0;
  if (input.Fuel[0].level < threshold) return 0;

  return rate * Math.max(0.1, x);
});
`,
  kernel: `export default TransitionKernel((input, parameters) => {
  // One draw shared by two attributes (same sample at fire time).
  const noise = Distribution.Gaussian(0, parameters.sigma);

  return {
    Out: [{
      x: noise.map((value) => input.Pool[0].x + value),
      generation: input.Pool[0].v > 0 ? 1 : 0,
      alive: input.Pool[0].alive,
    }],
  };
});
`,
};

// -- The pipeline result (recomputed every render — lowering is ~1ms) ----------

type PipelineResult = {
  context: HirSurfaceContext | null;
  schemaError: string | null;
  fn: HirFunction | null;
  diagnostics: HirDiagnostic[];
  typecheck: HirTypecheckResult | null;
  analysis: HirAnalysis | null;
  objectJs: string | null;
  bufferJs: string | null;
  bufferBailed: boolean;
};

function emitBuffer(
  fn: HirFunction,
  context: HirSurfaceContext,
): string | null {
  switch (context.surface) {
    case "dynamics":
      return emitBufferDynamicsJs(fn, context.elements);
    case "lambda": {
      const program = emitBufferLambdaJs(fn, context);
      return program
        ? `// inputSlotCount: ${program.inputSlotCount}\n${program.source}`
        : null;
    }
    case "kernel": {
      const program = emitBufferKernelJs(fn, context);
      return program
        ? `// inputSlotCount: ${program.inputSlotCount}, outputFloatCount: ${program.outputFloatCount}\n${program.source}`
        : null;
    }
  }
}

function runPipeline(
  surface: HirSurfaceKind,
  code: string,
  schemaJson: string,
): PipelineResult {
  let context: HirSurfaceContext | null = null;
  let schemaError: string | null = null;
  try {
    const schema = JSON.parse(schemaJson) as PlaygroundSchema;
    context = toContext(surface, schema);
  } catch (error) {
    schemaError = error instanceof Error ? error.message : String(error);
  }

  const empty: PipelineResult = {
    context,
    schemaError,
    fn: null,
    diagnostics: [],
    typecheck: null,
    analysis: null,
    objectJs: null,
    bufferJs: null,
    bufferBailed: false,
  };
  if (!context) {
    return empty;
  }

  // One call runs the full pipeline: lowering, typecheck, analyses, lints.
  const lint = lintHirUserCode(code, context);
  if (!lint.fn) {
    return { ...empty, diagnostics: lint.diagnostics };
  }

  let objectJs: string | null = null;
  let bufferJs: string | null = null;
  try {
    objectJs = emitUserFunctionJs(lint.fn);
    bufferJs = emitBuffer(lint.fn, context);
  } catch (error) {
    schemaError = error instanceof Error ? error.message : String(error);
  }

  return {
    context,
    schemaError,
    fn: lint.fn,
    diagnostics: lint.diagnostics,
    typecheck: lint.typecheck ?? null,
    analysis: lint.analysis ?? null,
    objectJs,
    bufferJs,
    bufferBailed: bufferJs === null,
  };
}

// -- Styles ---------------------------------------------------------------------

const pageStyle = css({
  display: "grid",
  gridTemplateColumns: "[1fr 1fr]",
  gap: "[16px]",
  width: "full",
  fontFamily: "body",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
  minWidth: "[0]",
});

const panelStyle = css({
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
});

const panelTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.s80",
  textTransform: "uppercase",
  letterSpacing: "wide",
  padding: "[6px 10px]",
  backgroundColor: "neutral.s10",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const preStyle = css({
  margin: "[0]",
  padding: "[10px]",
  fontSize: "xs",
  fontFamily: "mono",
  lineHeight: "[1.5]",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: "[320px]",
  overflow: "auto",
});

const surfaceBarStyle = css({
  display: "flex",
  gap: "[6px]",
});

const surfaceButtonStyle = css({
  fontSize: "sm",
  padding: "[4px 12px]",
  borderRadius: "md",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  cursor: "pointer",
  backgroundColor: "[transparent]",
  '&[data-active="true"]': {
    backgroundColor: "neutral.s90",
    color: "neutral.s10",
  },
});

const diagnosticStyle = css({
  display: "flex",
  gap: "[8px]",
  alignItems: "baseline",
  padding: "[6px 10px]",
  fontSize: "xs",
  fontFamily: "mono",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const severityStyle = css({
  fontWeight: "semibold",
  textTransform: "uppercase",
  fontSize: "[10px]",
  '&[data-severity="error"]': { color: "[#dc2626]" },
  '&[data-severity="warning"]': { color: "[#d97706]" },
  '&[data-severity="info"]': { color: "[#2563eb]" },
  '&[data-severity="hint"]': { color: "neutral.s70" },
});

const schemaTextareaStyle = css({
  width: "full",
  minHeight: "[180px]",
  fontFamily: "mono",
  fontSize: "xs",
  padding: "[10px]",
  border: "none",
  outline: "none",
  resize: "vertical",
});

const okStyle = css({
  padding: "[10px]",
  fontSize: "xs",
  color: "[#16a34a]",
});

// -- Components -------------------------------------------------------------------

const Panel = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className={panelStyle}>
    <div className={panelTitleStyle}>{title}</div>
    {children}
  </section>
);

const Json = ({ value }: { value: unknown }) => (
  <pre className={preStyle}>{JSON.stringify(value, null, 2)}</pre>
);

const DiagnosticsPanel = ({
  diagnostics,
  code,
}: {
  diagnostics: HirDiagnostic[];
  code: string;
}) => (
  <Panel title={`Diagnostics (${diagnostics.length})`}>
    {diagnostics.length === 0 ? (
      <div className={okStyle}>No diagnostics — compiles cleanly.</div>
    ) : (
      diagnostics.map((diagnostic) => (
        <div
          key={`${diagnostic.code}-${diagnostic.span.start}-${diagnostic.span.length}-${diagnostic.message}`}
          className={diagnosticStyle}
        >
          <span className={severityStyle} data-severity={diagnostic.severity}>
            {diagnostic.severity}
          </span>
          <span>
            <strong>{diagnostic.code}</strong> {diagnostic.message}
            <br />
            <em>
              @{diagnostic.span.start}..
              {diagnostic.span.start + diagnostic.span.length}:{" "}
              {JSON.stringify(
                code.slice(
                  diagnostic.span.start,
                  diagnostic.span.start + Math.min(diagnostic.span.length, 80),
                ),
              )}
            </em>
          </span>
        </div>
      ))
    )}
  </Panel>
);

const HirPlayground = () => {
  const [surface, setSurface] = useState<HirSurfaceKind>("kernel");
  const [codeBySurface, setCodeBySurface] = useState(CODE_PRESETS);
  const [schemaJson, setSchemaJson] = useState(
    JSON.stringify(DEFAULT_SCHEMA, null, 2),
  );

  const code = codeBySurface[surface];
  const result = runPipeline(surface, code, schemaJson);

  return (
    <div className={pageStyle}>
      {/* Left column — inputs */}
      <div className={columnStyle}>
        <div className={surfaceBarStyle}>
          {(["dynamics", "lambda", "kernel"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={surfaceButtonStyle}
              data-active={surface === candidate}
              onClick={() => setSurface(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>

        <Panel title="TypeScript user code">
          <CodeEditor
            height="360px"
            defaultLanguage="typescript"
            path={`inmemory://hir-playground/${surface}.ts`}
            value={code}
            onChange={(next) =>
              setCodeBySurface((previous) => ({
                ...previous,
                [surface]: next ?? "",
              }))
            }
          />
        </Panel>

        <Panel title="Model schema (parameters, places, attributes)">
          <textarea
            className={schemaTextareaStyle}
            value={schemaJson}
            onChange={(event) => setSchemaJson(event.target.value)}
            spellCheck={false}
          />
          {result.schemaError ? (
            <div className={diagnosticStyle}>
              <span className={severityStyle} data-severity="error">
                error
              </span>
              <span>{result.schemaError}</span>
            </div>
          ) : null}
        </Panel>

        <DiagnosticsPanel diagnostics={result.diagnostics} code={code} />

        {result.typecheck ? (
          <Panel title="Inferred return type">
            <pre className={preStyle}>
              {formatHirType(result.typecheck.returnType)}
            </pre>
          </Panel>
        ) : null}

        {result.analysis ? (
          <>
            <Panel title="Dependencies">
              <Json value={result.analysis.dependencies} />
            </Panel>
            <Panel title="Distribution DAG">
              <Json value={result.analysis.distributionDag} />
            </Panel>
            <Panel title="Bindings">
              <Json value={result.analysis.bindings} />
            </Panel>
          </>
        ) : null}
      </div>

      {/* Right column — compiler output */}
      <div className={columnStyle}>
        <Panel title="HIR (typed, spanned, JSON-serializable)">
          {result.fn ? (
            <Json value={result.fn} />
          ) : (
            <pre className={preStyle}>— lowering failed; see diagnostics —</pre>
          )}
        </Panel>

        <Panel
          title={
            result.bufferBailed
              ? "Buffer-ABI program — not scalarizable (object fallback runs)"
              : "Buffer-ABI program (direct packed-buffer reads)"
          }
        >
          <pre className={preStyle}>
            {result.bufferJs ??
              (result.fn
                ? "— this shape falls back to the object-convention program —"
                : "—")}
          </pre>
        </Panel>

        <Panel title="Object-convention program (fallback)">
          <pre className={preStyle}>{result.objectJs ?? "—"}</pre>
        </Panel>
      </div>
    </div>
  );
};

// -- Story ------------------------------------------------------------------------

const meta: Meta<typeof HirPlayground> = {
  title: "HIR/Playground",
  component: HirPlayground,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof HirPlayground>;

/**
 * Type Petrinaut user code on the left and watch the whole HIR pipeline on
 * the right: the lowered HIR tree (every node carries a stable `id` and a
 * source `span`), diagnostics with exact ranges, the inferred return type,
 * dependency sets, the distribution DAG (nodes, `.map` derivation edges,
 * output sinks and shared draws), and both compiled programs — the buffer-ABI
 * fast path with statically resolved token offsets, and the
 * object-convention fallback.
 *
 * The model schema (parameters, input/output places, attribute types) is
 * editable JSON — change an attribute to `"integer"` and watch the kernel
 * emit `Math.round`, or feed a Distribution into it and get the H-6519 error.
 */
export const Playground: Story = {
  render: () => (
    <MonacoProvider>
      <HirPlayground />
    </MonacoProvider>
  ),
};
