import { css } from "@hashintel/ds-helpers/css";
import { PiGraph } from "react-icons/pi";

import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../state/use-is-read-only";
import { useComponentInstancePropertiesContext } from "../context";

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
});

const paramVarNameStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontFamily: "mono",
});

const ComponentInstanceMainContent: React.FC = () => {
  const { instance, subnetParameters, updateComponentInstance } =
    useComponentInstancePropertiesContext();
  const isDisabled = useIsReadOnly();

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateComponentInstance(instance.id, (existing) => {
      existing.name = event.target.value;
    });
  };

  const handleUpdateParameterValue = (paramId: string, value: string) => {
    updateComponentInstance(instance.id, (existing) => {
      existing.parameterValues[paramId] = value;
    });
  };

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={instance.name}
          onChange={handleUpdateName}
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      {subnetParameters.length > 0 && (
        <Section title="Parameters">
          <SectionList>
            {subnetParameters.map((param) => (
              <Section
                key={param.id}
                title={param.name}
                tooltip={`Variable: ${param.variableName} (${param.type})`}
              >
                <Input
                  value={
                    instance.parameterValues[param.id] ?? param.defaultValue
                  }
                  onChange={(event) =>
                    handleUpdateParameterValue(param.id, event.target.value)
                  }
                  disabled={isDisabled}
                  tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                />
                <div className={paramVarNameStyle}>{param.variableName}</div>
              </Section>
            ))}
          </SectionList>
        </Section>
      )}
    </SectionList>
  );
};

const ComponentInstanceTitle: React.FC = () => {
  const { subnet } = useComponentInstancePropertiesContext();
  const subnetName = subnet?.name ?? "Component";
  return <span className={titleStyle}>{subnetName} (instance)</span>;
};

export const componentInstanceMainContentSubView: SubView = {
  id: "component-instance-main-content",
  title: "Component Instance",
  icon: PiGraph,
  main: true,
  renderTitle: () => <ComponentInstanceTitle />,
  component: ComponentInstanceMainContent,
};
