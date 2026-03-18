import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";

import { Select } from "../components/select";
import { CodeEditor } from "../monaco/code-editor";
import type {
  ExpressionOutput,
  ExpressionOutputFormat,
} from "./use-expression-ir-output";

const FORMAT_LANGUAGE: Record<ExpressionOutputFormat, string> = {
  ir: "json",
  sympy: "python",
  ocaml: "fsharp",
  lean: "fsharp",
};

const containerStyle = css({
  position: "relative",
  height: "full",
});

const selectContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  position: "absolute",
  bottom: "0",
  right: "0",
  zIndex: "[10]",
  backdropFilter: "[blur(20px)]",
  p: "1",
  pl: "2",
  borderTopLeftRadius: "sm",
});

const selectLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const selectStyle = css({
  width: "[90px]",
});

export const ExpressionOutputPanel: React.FC<{
  output: ExpressionOutput;
}> = ({ output }) => {
  const [format, setFormat] = useState<ExpressionOutputFormat>("ir");

  return (
    <div className={containerStyle}>
      <div className={selectContainerStyle}>
        <span className={selectLabelStyle}>Target</span>
        <Select
          value={format}
          className={selectStyle}
          onValueChange={(value) => setFormat(value as ExpressionOutputFormat)}
          options={[
            { value: "ir", label: "IR" },
            { value: "sympy", label: "SymPy" },
            { value: "ocaml", label: "OCaml" },
            { value: "lean", label: "Lean" },
          ]}
          size="xs"
          portal={false}
        />
      </div>
      <CodeEditor
        key={format}
        value={output[format]}
        defaultLanguage={FORMAT_LANGUAGE[format]}
        height="100%"
        options={{ readOnly: true, lineNumbers: "off" }}
      />
    </div>
  );
};
