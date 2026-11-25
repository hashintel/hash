import { Form } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { usePetrinautPresentation } from "../../../../../../presentation/presentation-context";
import { DescriptionField } from "../../description-field";
import { DraftFieldInput } from "../../draft-field-input";
import { useMetricPropertiesContext } from "../context";
import { MetricCodeField } from "./code-field";

// the section fills the panel; the last row (Code) takes the remaining height
const metricFieldsStyle = css({
  paddingTop: "3",
  flex: "[1]",
  minHeight: "[0]",
  gridTemplateRows: "[auto auto minmax(0, 1fr)]",
});

export const MetricMainContent: React.FC = () => {
  const { metric, otherMetricNames } = useMetricPropertiesContext();
  const { updateMetric } = usePetrinautMutations();
  const presentation = usePetrinautPresentation();
  const isReadOnly = useIsReadOnly();

  return (
    <Form.Section className={metricFieldsStyle}>
      <DraftFieldInput
        label="Name"
        sourceId={metric.id}
        sourceValue={metric.name}
        validate={(draft) => {
          const result = validateDisplayName(draft);
          return result.valid && otherMetricNames.has(result.name)
            ? {
                valid: false,
                error: `A metric named "${result.name}" already exists.`,
              }
            : result;
        }}
        onCommit={(name) =>
          updateMetric({ metricId: metric.id, update: { name } })
        }
      />

      <DescriptionField
        sourceId={metric.id}
        sourceValue={metric.description}
        onCommit={(description) =>
          updateMetric({ metricId: metric.id, update: { description } })
        }
        disabled={isReadOnly}
      />

      {presentation.showSourceCode && <MetricCodeField />}
    </Form.Section>
  );
};
