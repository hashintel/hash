import { Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getMetricDocumentUri } from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { useMetricLspSession } from "../../../SimulateView/metrics/use-metric-lsp-session";
import { useMetricPropertiesContext } from "../context";

const codeFieldStyle = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
});

const codeEditorBoxStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minHeight: "0",
});

/**
 * The metric's code, checked in a language session named after the metric,
 * so the editor's document stays the same one while the metric is selected.
 */
export const MetricCodeField: React.FC = () => {
  const { metric } = useMetricPropertiesContext();
  const { updateMetric } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const sessionId = useMetricLspSession(metric.code, metric.id);

  return (
    <Form.Field as="legend" label="Code" size="sm" className={codeFieldStyle}>
      <div className={codeEditorBoxStyle}>
        <CodeEditor
          path={getMetricDocumentUri(sessionId)}
          language="typescript"
          value={metric.code}
          height="100%"
          onChange={(newCode) => {
            updateMetric({
              metricId: metric.id,
              update: { code: newCode ?? "" },
            });
          }}
          options={{ readOnly: isReadOnly }}
        />
      </div>
    </Form.Field>
  );
};
