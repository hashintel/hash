import { Form, TextInput, Tooltip } from "@hashintel/ds-components";
import {
  validateDisplayName,
  validateVariableName,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { UI_MESSAGES } from "../../../../shared/ui-messages";
import { DraftFieldInput } from "../../draft-field-input";
import { fieldsSectionStyle } from "../../styles";
import { useParameterPropertiesContext } from "../context";

export const ParameterMainContent: React.FC = () => {
  const { parameter } = useParameterPropertiesContext();
  const { updateParameter } = usePetrinautMutations();
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
        monospace
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
