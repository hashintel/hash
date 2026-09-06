import { Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { getDocumentUri } from "../../../../../../monaco/editor-paths";
import { useDiffEqPropertiesContext } from "../context";

const codeFieldStyle = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
});

const codeEditorBoxStyle = css({
  flex: "1",
  minHeight: "0",
});

export const DifferentialEquationCodeField: React.FC = () => {
  const { differentialEquation, updateDifferentialEquation } =
    useDiffEqPropertiesContext();
  const isReadOnly = useIsReadOnly();

  return (
    <Form.Field as="legend" label="Code" size="sm" className={codeFieldStyle}>
      <div className={codeEditorBoxStyle}>
        <CodeEditor
          path={getDocumentUri(
            "differential-equation",
            differentialEquation.id,
          )}
          language="typescript"
          value={differentialEquation.code}
          height="100%"
          onChange={(newCode) => {
            updateDifferentialEquation({
              equationId: differentialEquation.id,
              update: { code: newCode ?? "" },
            });
          }}
          options={{ readOnly: isReadOnly }}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>
    </Form.Field>
  );
};
