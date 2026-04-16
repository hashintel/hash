import { css } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { editor as MonacoEditor } from "monaco-editor";
import { type ReactNode, useRef, useState } from "react";

import type { SDCPN } from "../core/types/sdcpn";
import { LanguageClientProvider } from "../lsp/provider";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { CodeEditor } from "./code-editor";
import { MonacoProvider } from "./provider";

// -- Helpers ------------------------------------------------------------------

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
  width: "full",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const Frame = ({ children }: { children: ReactNode }) => (
  <MonacoProvider>
    <div className={containerStyle}>{children}</div>
  </MonacoProvider>
);

// -- LSP helpers --------------------------------------------------------------

const LAMBDA_SDCPN: SDCPN = {
  places: [
    {
      id: "place-1",
      name: "Susceptible",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-2",
      name: "Infected",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "transition-1",
      name: "Infection",
      inputArcs: [
        { placeId: "place-1", weight: 1, type: "standard" },
        { placeId: "place-2", weight: 1, type: "standard" },
      ],
      outputArcs: [{ placeId: "place-2", weight: 2 }],
      lambdaType: "stochastic",
      lambdaCode:
        "export default Lambda((tokens, parameters) => parameters.rate)",
      transitionKernelCode:
        "export default TransitionKernel(() => ({ Infected: [{}, {}] }))",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "3",
    },
    {
      id: "param-recovery",
      name: "Recovery",
      variableName: "recovery",
      type: "real",
      defaultValue: "1",
    },
  ],
};

const LSP_CONTEXT: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "story-net",
  petriNetDefinition: LAMBDA_SDCPN,
  readonly: false,
  setTitle: () => {},
  title: "Story Net",
  getItemType: () => null,
};

const LspFrame = ({ children }: { children: ReactNode }) => (
  <SDCPNContext value={LSP_CONTEXT}>
    <LanguageClientProvider>
      <MonacoProvider>
        <div className={containerStyle}>{children}</div>
      </MonacoProvider>
    </LanguageClientProvider>
  </SDCPNContext>
);

// -- Meta ---------------------------------------------------------------------

const meta = {
  title: "Components / CodeEditor",
  component: CodeEditor,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof CodeEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

// -- Multi-line stories -------------------------------------------------------

const MultiLineExample = () => {
  const [value, setValue] = useState('const x = 42;\nconsole.log("hello");');

  return (
    <Frame>
      <CodeEditor
        language="typescript"
        value={value}
        onChange={(v) => setValue(v ?? "")}
        height={120}
      />
    </Frame>
  );
};

export const Default: Story = {
  name: "Multi-line",
  render: () => <MultiLineExample />,
};

// Play-function story that verifies Enter inserts a newline
let _capturedEditor: MonacoEditor.IStandaloneCodeEditor | null = null;

const EnterTestExample = () => {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  return (
    <Frame>
      <CodeEditor
        language="typescript"
        defaultValue=""
        height={120}
        onMount={(ed) => {
          editorRef.current = ed;
          _capturedEditor = ed;
        }}
      />
    </Frame>
  );
};

export const EnterKeyTest: Story = {
  name: "Multi-line (Enter key test)",
  render: () => <EnterTestExample />,
  play: async () => {
    // Wait for Monaco to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const ed = _capturedEditor;
    if (!ed) {
      throw new Error("Editor not mounted");
    }

    ed.focus();

    // Type first line
    ed.trigger("keyboard", "type", { text: "line one" });
    // Press Enter via trigger
    ed.trigger("keyboard", "type", { text: "\n" });
    // Type second line
    ed.trigger("keyboard", "type", { text: "line two" });

    const model = ed.getModel();
    if (!model) {
      throw new Error("No model");
    }

    const lineCount = model.getLineCount();
    const line1 = model.getLineContent(1);
    const line2 = model.getLineContent(2);

    if (lineCount < 2) {
      throw new Error(
        `Expected at least 2 lines, got ${lineCount}. Content: ${JSON.stringify(model.getValue())}`,
      );
    }
    if (line1 !== "line one" || line2 !== "line two") {
      throw new Error(
        `Unexpected content: line1=${JSON.stringify(line1)}, line2=${JSON.stringify(line2)}`,
      );
    }

    // eslint-disable-next-line no-console
    console.log("Enter key test passed: 2 lines created successfully");
  },
};

export const ReadOnly: Story = {
  name: "Multi-line (read-only)",
  render: () => (
    <Frame>
      <CodeEditor
        language="typescript"
        value={"function greet(name: string) {\n  return 'Hello, ' + name;\n}"}
        height={100}
        options={{ readOnly: true }}
      />
    </Frame>
  ),
};

// -- Single-line stories ------------------------------------------------------

const SingleLineExample = () => {
  const [value, setValue] = useState("");

  return (
    <Frame>
      <span className={labelStyle}>Expression</span>
      <CodeEditor
        singleLine
        value={value}
        onChange={(v) => setValue(v ?? "")}
        placeholder="e.g. parameters.rate * 2"
      />
    </Frame>
  );
};

export const SingleLine: Story = {
  name: "Single-line",
  render: () => <SingleLineExample />,
};

const SingleLineWithValueExample = () => {
  const [value, setValue] = useState("parameters.infection_rate * 0.5");

  return (
    <Frame>
      <span className={labelStyle}>Infection rate override</span>
      <CodeEditor
        singleLine
        value={value}
        onChange={(v) => setValue(v ?? "")}
      />
    </Frame>
  );
};

export const SingleLineWithValue: Story = {
  name: "Single-line (with value)",
  render: () => <SingleLineWithValueExample />,
};

export const SingleLineReadOnly: Story = {
  name: "Single-line (read-only)",
  render: () => (
    <Frame>
      <span className={labelStyle}>Computed value (read-only)</span>
      <CodeEditor
        singleLine
        value="Math.round(parameters.rate * 100)"
        options={{ readOnly: true }}
      />
    </Frame>
  ),
};

const MultipleFieldsExample = () => {
  const [rate, setRate] = useState("3.5");
  const [count, setCount] = useState("Math.floor(parameters.population * 0.1)");
  const [threshold, setThreshold] = useState("");

  return (
    <Frame>
      <div>
        <span className={labelStyle}>Infection rate</span>
        <CodeEditor
          singleLine
          value={rate}
          onChange={(v) => setRate(v ?? "")}
          placeholder="number or expression"
        />
      </div>
      <div>
        <span className={labelStyle}>Initial infected count</span>
        <CodeEditor
          singleLine
          value={count}
          onChange={(v) => setCount(v ?? "")}
          placeholder="number or expression"
        />
      </div>
      <div>
        <span className={labelStyle}>Recovery threshold</span>
        <CodeEditor
          singleLine
          value={threshold}
          onChange={(v) => setThreshold(v ?? "")}
          placeholder="e.g. 0.95"
        />
      </div>
    </Frame>
  );
};

export const MultipleFields: Story = {
  name: "Single-line (multiple fields)",
  render: () => <MultipleFieldsExample />,
};

// -- LSP story ----------------------------------------------------------------

const WithLspExample = () => {
  const [value, setValue] = useState(
    "export default Lambda((tokens, parameters) => parameters.rate)",
  );

  return (
    <LspFrame>
      <span className={labelStyle}>
        Lambda code (with completions and diagnostics)
      </span>
      <CodeEditor
        path="inmemory://sdcpn/transitions/transition-1/lambda.ts"
        language="typescript"
        value={value}
        onChange={(v) => setValue(v ?? "")}
        height={60}
      />
    </LspFrame>
  );
};

export const WithLsp: Story = {
  name: "Multi-line (with LSP)",
  render: () => <WithLspExample />,
};
