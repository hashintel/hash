import { css } from "@hashintel/ds-helpers/css";
import { useEffect, useState } from "react";

import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { validateDisplayName } from "@hashintel/petrinaut-core/validation/display-name";
import { validateVariableName } from "@hashintel/petrinaut-core/validation/variable-name";
import { useParameterPropertiesContext } from "../context";

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const [nameInput, setNameInput] = useState(parameter.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [varNameInput, setVarNameInput] = useState(parameter.variableName);
  const [varNameError, setVarNameError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(parameter.name);
    setNameError(null);
  }, [parameter.id, parameter.name]);

  useEffect(() => {
    setVarNameInput(parameter.variableName);
    setVarNameError(null);
  }, [parameter.id, parameter.variableName]);

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
          value={nameInput}
          onChange={(event) => {
            setNameInput(event.target.value);
            if (nameError) {
              setNameError(null);
            }
          }}
          onBlur={() => {
            const result = validateDisplayName(nameInput);

            if (!result.valid) {
              setNameError(result.error);
              return;
            }

            setNameError(null);
            if (result.name !== parameter.name) {
              updateParameter({
                parameterId: parameter.id,
                update: { name: result.name },
              });
            }
          }}
          disabled={isDisabled}
          hasError={!!nameError}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        {nameError && <div className={errorMessageStyle}>{nameError}</div>}
      </Section>

      <Section title="Variable Name">
        <Input
          value={varNameInput}
          onChange={(event) => {
            setVarNameInput(event.target.value);
            if (varNameError) {
              setVarNameError(null);
            }
          }}
          onBlur={() => {
            const result = validateVariableName(varNameInput);

            if (!result.valid) {
              setVarNameError(result.error);
              return;
            }

            setVarNameError(null);
            if (result.name !== parameter.variableName) {
              updateParameter({
                parameterId: parameter.id,
                update: { variableName: result.name },
              });
            }
          }}
          disabled={isDisabled}
          monospace
          hasError={!!varNameError}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        {varNameError && (
          <div className={errorMessageStyle}>{varNameError}</div>
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
