import { css } from "@hashintel/ds-helpers/css";
import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { useDraftField } from "../../../../../../hooks/use-draft-field";
import {
  validateDisplayName,
  validateVariableName,
} from "@hashintel/petrinaut-core";
import { useParameterPropertiesContext } from "../context";

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const nameField = useDraftField({
    sourceId: parameter.id,
    sourceValue: parameter.name,
  });
  const variableNameField = useDraftField({
    sourceId: parameter.id,
    sourceValue: parameter.variableName,
  });

  const handleUpdateDefaultValue = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter({
      parameterId: parameter.id,
      update: { defaultValue: event.target.value },
    });
  };

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={nameField.value}
          onChange={(event) => {
            nameField.setValue(event.target.value);
            if (nameField.error) {
              nameField.setError(null);
            }
          }}
          onBlur={() => {
            const result = validateDisplayName(nameField.value);

            if (!result.valid) {
              nameField.setError(result.error);
              return;
            }

            nameField.setError(null);
            if (result.name !== parameter.name) {
              updateParameter({
                parameterId: parameter.id,
                update: { name: result.name },
              });
            }
          }}
          disabled={isDisabled}
          hasError={!!nameField.error}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        {nameField.error && (
          <div className={errorMessageStyle}>{nameField.error}</div>
        )}
      </Section>

      <Section title="Variable Name">
        <Input
          value={variableNameField.value}
          onChange={(event) => {
            variableNameField.setValue(event.target.value);
            if (variableNameField.error) {
              variableNameField.setError(null);
            }
          }}
          onBlur={() => {
            const result = validateVariableName(variableNameField.value);

            if (!result.valid) {
              variableNameField.setError(result.error);
              return;
            }

            variableNameField.setError(null);
            if (result.name !== parameter.variableName) {
              updateParameter({
                parameterId: parameter.id,
                update: { variableName: result.name },
              });
            }
          }}
          disabled={isDisabled}
          monospace
          hasError={!!variableNameField.error}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        {variableNameField.error && (
          <div className={errorMessageStyle}>{variableNameField.error}</div>
        )}
      </Section>

      <Section title="Default Value">
        <Input
          value={parameter.defaultValue}
          onChange={handleUpdateDefaultValue}
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>
    </SectionList>
  );
};

export const parameterMainContentSubView: SubView = {
  id: "parameter-main-content",
  title: "Parameter",
  icon: ParameterIcon,
  main: true,
  component: ParameterMainContent,
};
