import { Form, TextInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  validateDisplayName,
  validateVariableName,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useParameterPropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const handleUpdateDefaultValue = (defaultValue: string) => {
    updateParameter({
      parameterId: parameter.id,
      update: { defaultValue },
    });
  };

  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;

  return (
    <Form.Section className={fieldsSectionStyle}>
      <DraftFieldInput
        label="Name"
        sourceId={parameter.id}
        sourceValue={parameter.name}
        validate={validateDisplayName}
        onCommit={(name) =>
          updateParameter({
            parameterId: parameter.id,
            update: { name },
          })
        }
        disabled={isDisabled}
        tooltip={readOnlyTooltip}
      />

      <DraftFieldInput
        label="Variable Name"
        sourceId={parameter.id}
        sourceValue={parameter.variableName}
        validate={validateVariableName}
        onCommit={(variableName) =>
          updateParameter({
            parameterId: parameter.id,
            update: { variableName },
          })
        }
        disabled={isDisabled}
        monospace
        tooltip={readOnlyTooltip}
      />

      <Form.Field label="Default Value" size="sm" disabled={isDisabled}>
        <Tooltip content={readOnlyTooltip ?? ""} disableTooltip={!isDisabled}>
          <TextInput
            value={parameter.defaultValue}
            onChange={handleUpdateDefaultValue}
            disabled={isDisabled}
            size="sm"
          />
        </Tooltip>
      </Form.Field>
    </Form.Section>
  );
};

export const parameterMainContentSubView: SubView = {
  id: "parameter-main-content",
  title: "Parameter",
  icon: ParameterIcon,
  main: true,
  component: ParameterMainContent,
};
