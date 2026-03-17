import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../state/use-is-read-only";
import { useParameterPropertiesContext } from "../context";

const slugifyToIdentifier = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .replace(/^(\d)/, "_$1");
};

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.name = event.target.value;
    });
  };

  const handleUpdateVariableName = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.variableName = event.target.value;
    });
  };

  const handleBlurVariableName = (
    event: React.FocusEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value.trim();
    if (value === "") {
      updateParameter(parameter.id, (existingParameter) => {
        existingParameter.variableName = "param";
      });
    } else {
      const slugified = slugifyToIdentifier(value);
      if (slugified !== value) {
        updateParameter(parameter.id, (existingParameter) => {
          existingParameter.variableName = slugified;
        });
      }
    }
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
          value={parameter.variableName}
          onChange={handleUpdateVariableName}
          onBlur={handleBlurVariableName}
          disabled={isDisabled}
          monospace
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Default Value">
        <Input
          value={parameter.defaultValue}
          onChange={handleUpdateDefaultValue}
          disabled={isDisabled}
          monospace
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
