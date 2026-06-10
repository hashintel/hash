import { TextInput, Tooltip } from "@hashintel/ds-components";
import {
  validateDisplayName,
  validateVariableName,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { ParameterIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useParameterPropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const handleUpdateDefaultValue = (value: string) => {
    updateParameter({
      parameterId: parameter.id,
      update: { defaultValue: value },
    });
  };

  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;

  return (
    <SectionList>
      <Section title="Name">
        <DraftFieldInput
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
      </Section>

      <Section title="Variable Name">
        <DraftFieldInput
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
      </Section>

      <Section title="Default Value">
        <Tooltip content={readOnlyTooltip ?? ""} disableTooltip={!isDisabled}>
          <TextInput
            value={parameter.defaultValue}
            onChange={handleUpdateDefaultValue}
            disabled={isDisabled}
            size="sm"
          />
        </Tooltip>
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
