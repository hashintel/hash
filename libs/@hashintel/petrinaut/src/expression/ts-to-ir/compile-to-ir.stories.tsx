import type { Meta, StoryObj } from "@storybook/react-vite";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useCallback, useRef, useState } from "react";

import type { CompilationContext } from "./compile-to-ir";
import { compileToIR } from "./compile-to-ir";

type IRResult = ReturnType<typeof compileToIR>;

// Use bundled Monaco directly, no workers needed for basic editing
loader.config({ monaco });

const DEFAULT_CODE = `export default Lambda((tokens, parameters) => {
  const rate = parameters.infection_rate;
  return rate * tokens.Space[0].x;
})`;

const DEFAULT_CONTEXT: CompilationContext = {
  parameterNames: new Set([
    "infection_rate",
    "recovery_rate",
    "gravitational_constant",
  ]),
  placeTokenFields: new Map([["Space", ["x", "y", "direction", "velocity"]]]),
  constructorFnName: "Lambda",
};

function formatResult(result: IRResult): string {
  if (result.ok) {
    return JSON.stringify(result.ir, null, 2);
  }
  return JSON.stringify(
    { error: result.error, start: result.start, length: result.length },
    null,
    2,
  );
}

function compile(code: string): string {
  return formatResult(compileToIR(code, DEFAULT_CONTEXT));
}

function IRPlayground() {
  const [output, setOutput] = useState(() => compile(DEFAULT_CODE));
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onChange = useCallback((value: string | undefined) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOutput(compile(value ?? ""));
    }, 300);
  }, []);

  /** Disable all TypeScript diagnostics in the editor */
  const onMount = useCallback((_editor: unknown, instance: Monaco) => {
    instance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
  }, []);

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "8px 0",
            fontWeight: 600,
            fontSize: 13,
            fontFamily: "sans-serif",
            color: "#ccc",
          }}
        >
          TypeScript
        </div>
        <div style={{ flex: 1, border: "1px solid #333", borderRadius: 4 }}>
          <Editor
            defaultLanguage="typescript"
            defaultValue={DEFAULT_CODE}
            onChange={onChange}
            onMount={onMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "8px 0",
            fontWeight: 600,
            fontSize: 13,
            fontFamily: "sans-serif",
            color: "#ccc",
          }}
        >
          Expression IR (JSON)
        </div>
        <div style={{ flex: 1, border: "1px solid #333", borderRadius: 4 }}>
          <Editor
            language="json"
            value={output}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Compiler / TypeScript to IR",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <div
      style={{
        height: "100vh",
        padding: 16,
        boxSizing: "border-box",
        background: "#1e1e1e",
      }}
    >
      <IRPlayground />
    </div>
  ),
};
