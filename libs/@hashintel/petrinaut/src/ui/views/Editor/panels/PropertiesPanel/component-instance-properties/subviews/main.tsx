import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { useComponentInstancePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

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

const hintTextStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
});

const ComponentInstanceMainContent: React.FC = () => {
  const { instance, subnet, subnetParameters, updateComponentInstance } =
    useComponentInstancePropertiesContext();
  const isDisabled = useIsReadOnly();

  return (
    <SectionList>
      <Section title="Name">
        <Input
          value={instance.name}
          onChange={(event) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: { name: event.target.value },
            })
          }
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Subnet">
        <div className={hintTextStyle}>
          {subnet?.name ?? "The referenced subnet no longer exists."}
        </div>
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
                    updateComponentInstance({
                      instanceId: instance.id,
                      update: {
                        parameterValues: {
                          ...instance.parameterValues,
                          [param.id]: event.target.value,
                        },
                      },
                    })
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
  return (
    <span className={titleStyle}>{subnet?.name ?? "Component"} instance</span>
  );
};

export const componentInstanceMainContentSubView: SubView = {
  id: "component-instance-main-content",
  title: "Component Instance",
  icon: ({ size }) => <Icon name="cube" size={size === 12 ? "xs" : "sm"} />,
  main: true,
  renderTitle: () => <ComponentInstanceTitle />,
  component: ComponentInstanceMainContent,
};
