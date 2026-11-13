import { use } from "react";

import {
  Button,
  Form,
  Icon,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  defaultImplementationId,
  describeUnboundInstance,
  implementationsOf,
  isInterface,
  resolveImplementation,
  validateEntityName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DescriptionField } from "../../../../../../components/description-field";
import { PropertyValue } from "../../../../../../components/property-value";
import { Section, SectionList } from "../../../../../../components/section";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useDraftField } from "../../../../../../hooks/use-draft-field";
import { useComponentInstancePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";
import type { Subnet } from "@hashintel/petrinaut-core";

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

// the compact pre-migration label treatment for the parameter rows
const paramFieldLabelStyle = css({
  "& :is(label, legend)": {
    fontSize: "xs",
    fontWeight: "medium",
    color: "neutral.s100",
  },
});

const hintTextStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
});

/**
 * Which implementation runs for an instance of an interface: the instance's
 * own choice, or the document's default.
 */
const ImplementationField: React.FC<{ iface: Subnet }> = ({ iface }) => {
  const { instance, updateComponentInstance } =
    useComponentInstancePropertiesContext();
  const { petriNetDefinition } = use(SDCPNContext);
  const isDisabled = useIsReadOnly();

  const subnetName = (subnetId: string | undefined) =>
    (petriNetDefinition.subnets ?? []).find(({ id }) => id === subnetId)?.name;
  const binding = resolveImplementation(petriNetDefinition, instance);
  const description =
    binding?.kind === "bound"
      ? binding.chosenBy === "instance"
        ? `Runs ${binding.implementation.name}, chosen for this instance.`
        : `Runs ${binding.implementation.name}, the document's default.`
      : binding?.kind === "unbound"
        ? describeUnboundInstance(binding, instance.name)
        : undefined;
  const defaultName = subnetName(
    defaultImplementationId(petriNetDefinition, iface.id),
  );
  const implementations = implementationsOf(petriNetDefinition, iface.id);
  // A loaded document may name a subnet that does not implement the
  // interface: it stays listed under its name until the choice changes.
  const chosenElsewhere =
    instance.implementation !== undefined &&
    !implementations.some(({ id }) => id === instance.implementation)
      ? [
          {
            value: instance.implementation,
            text: subnetName(instance.implementation) ?? "Unknown subnet",
          },
        ]
      : [];

  return (
    <Form.Field
      label="Implementation"
      size="sm"
      descriptionBottom={
        description === undefined ? undefined : (
          <span className={hintTextStyle}>{description}</span>
        )
      }
    >
      <Tooltip
        content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : ""}
        disableTooltip={!isDisabled}
      >
        <Select
          required
          size="sm"
          value={instance.implementation ?? "default"}
          disabled={isDisabled}
          onChange={(value) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: {
                implementation: value === "default" ? undefined : value,
              },
            })
          }
          items={[
            {
              value: "default",
              text:
                defaultName === undefined
                  ? "Document default (none)"
                  : `Document default (${defaultName})`,
            },
            ...implementations.map(({ id, name }) => ({
              value: id,
              text: name,
            })),
            ...chosenElsewhere,
          ]}
        />
      </Tooltip>
    </Form.Field>
  );
};

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
          errors={
            !isDisabled && nameField.error ? [nameField.error] : undefined
          }
        >
          <PropertyValue text={instance.name}>
            <Tooltip
              content={readOnlyTooltip ?? ""}
              disableTooltip={!isDisabled}
            >
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
          </PropertyValue>
        </Form.Field>

        <DescriptionField
          sourceId={instance.id}
          sourceValue={instance.description}
          onCommit={(description) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: { description },
            })
          }
          disabled={isDisabled}
          tooltip={readOnlyTooltip}
        />

        <Form.Field label="Subnet" size="sm">
          <div className={hintTextStyle}>
            {subnet?.name ?? "The referenced subnet no longer exists."}
          </div>
        </Form.Field>

        {subnet && isInterface(subnet) && (
          <ImplementationField iface={subnet} />
        )}
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
                className={paramFieldLabelStyle}
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
      aria-label="Delete component instance"
      size="sm"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => removeComponentInstance({ instanceId: instance.id })}
      disabled={isReadOnly}
      tooltip={
        isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete component instance"
      }
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
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};
