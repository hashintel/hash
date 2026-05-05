import { css } from "@hashintel/ds-helpers/css";
import { useEffect, useState } from "react";

import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../state/use-is-read-only";
import { validateVariableName } from "../../../../../../validation/variable-name";
import { useParameterPropertiesContext } from "../context";

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const [varNameInput, setVarNameInput] = useState(parameter.variableName);
  const [varNameError, setVarNameError] = useState<string | null>(null);

  useEffect(() => {
    setVarNameInput(parameter.variableName);
    setVarNameError(null);
  }, [parameter.id, parameter.variableName]);

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.name = event.target.value;
    });
  };

  const handleUpdateDefaultValue = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.defaultValue = event.target.value;
    });
  };

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={parameter.name}
          onChange={handleUpdateName}
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
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
              updateParameter(parameter.id, (existingParameter) => {
                existingParameter.variableName = result.name;
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
