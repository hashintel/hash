import {
  Button,
  Form,
  Icon,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { validateEntityName } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { Section, SectionList } from "../../../../../../components/section";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useDraftField } from "../../../../../../hooks/use-draft-field";
import { useComponentInstancePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

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
  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;

  const nameField = useDraftField({
    sourceId: instance.id,
    sourceValue: instance.name,
  });

  const handleNameBlur = () => {
    const result = validateEntityName(nameField.value);
    if (!result.valid) {
      nameField.setError(result.error);
      return;
    }
    nameField.setError(null);
    if (result.name !== instance.name) {
      updateComponentInstance({
        instanceId: instance.id,
        update: { name: result.name },
      });
    }
  };

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <Form.Field
          label="Name"
          size="sm"
          disabled={isDisabled}
          errors={nameField.error ? [nameField.error] : undefined}
        >
          <Tooltip content={readOnlyTooltip ?? ""} disableTooltip={!isDisabled}>
            <TextInput
              value={nameField.value}
              size="sm"
              onChange={(name) => {
                nameField.setValue(name);
                if (nameField.error) nameField.setError(null);
              }}
              onBlur={handleNameBlur}
              disabled={isDisabled}
              invalid={!!nameField.error}
            />
          </Tooltip>
        </Form.Field>

        <Form.Field label="Subnet" size="sm">
          <div className={hintTextStyle}>
            {subnet?.name ?? "The referenced subnet no longer exists."}
          </div>
        </Form.Field>
      </Form.Section>

      {subnetParameters.length > 0 && (
        <Section title="Parameters">
          <Form.Section>
            {subnetParameters.map((param) => (
              <Form.Field
                key={param.id}
                label={param.name}
                labelTooltip={`Variable: ${param.variableName} (${param.type})`}
                size="sm"
                disabled={isDisabled}
                descriptionBottom={
                  <span className={paramVarNameStyle}>
                    {param.variableName}
                  </span>
                }
              >
                <Tooltip
                  content={readOnlyTooltip ?? ""}
                  disableTooltip={!isDisabled}
                >
                  <TextInput
                    value={
                      instance.parameterValues[param.id] ?? param.defaultValue
                    }
                    size="sm"
                    onChange={(value) =>
                      updateComponentInstance({
                        instanceId: instance.id,
                        update: {
                          parameterValues: {
                            ...instance.parameterValues,
                            [param.id]: value,
                          },
                        },
                      })
                    }
                    disabled={isDisabled}
                  />
                </Tooltip>
              </Form.Field>
            ))}
          </Form.Section>
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

const DeleteComponentInstanceAction: React.FC = () => {
  const { instance } = useComponentInstancePropertiesContext();
  const { removeComponentInstance } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Delete"
      size="xs"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => removeComponentInstance({ instanceId: instance.id })}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete"}
    />
  );
};

export const componentInstanceMainContentSubView: SubView = {
  id: "component-instance-main-content",
  title: "Component Instance",
  icon: ({ size }) => <Icon name="cube" size={size === 12 ? "xs" : "sm"} />,
  main: true,
  renderTitle: () => <ComponentInstanceTitle />,
  component: ComponentInstanceMainContent,
  renderHeaderAction: () => <DeleteComponentInstanceAction />,
  alwaysShowHeaderAction: true,
};
