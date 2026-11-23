import { use } from "react";

import {
  Form,
  Icon,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  componentKey,
  defaultImplementation,
  describeUnboundInstance,
  isInterface,
  resolveComponent,
  resolveImplementation,
  validateEntityName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { CompositionContext } from "../../../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../../../react/document/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { useMutationRefusal } from "../../../../../../../react/editing/use-mutation-refusal";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { hintTextStyle } from "../../../../../../constants/hint-text";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { implementationItems } from "../../../implementation-items";
import { DeleteItemButton } from "../../delete-item-button";
import { fieldsSectionStyle, itemTitleStyle } from "../../styles";
import { useComponentInstancePropertiesContext } from "../context";

const paramVarNameStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontFamily: "mono",
});

const paramFieldLabelStyle = css({
  "& :is(label, legend)": {
    fontSize: "xs",
    fontWeight: "medium",
    color: "neutral.s100",
  },
});

/**
 * Which implementation runs for an instance of an interface: the instance's
 * own choice, or the document's default.
 */
const ImplementationField: React.FC = () => {
  const { instance } = useComponentInstancePropertiesContext();
  const { updateComponentInstance } = usePetrinautMutations();
  const { petriNetDefinition } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);
  const mutationRefusal = useMutationRefusal();
  const isDisabled = useIsReadOnly();

  const binding = resolveImplementation(
    petriNetDefinition,
    instance,
    libraries,
  );
  const description =
    binding?.kind === "bound"
      ? binding.chosenBy === "instance"
        ? `Runs ${binding.implementation.name}, chosen for this instance.`
        : `Runs ${binding.implementation.name}, the document's default.`
      : binding?.kind === "unbound"
        ? describeUnboundInstance(binding, instance.name)
        : undefined;
  const documentDefault = defaultImplementation(
    petriNetDefinition,
    instance.component,
  );
  const defaultName =
    documentDefault &&
    resolveComponent(petriNetDefinition, documentDefault, libraries)?.name;
  const implementations = implementationItems(
    petriNetDefinition,
    instance.component,
    instance.implementation,
    libraries,
    // The host's rules refuse some components as an instance's choice.
    (implementation) =>
      mutationRefusal("updateComponentInstance", {
        instanceId: instance.id,
        update: { implementation },
      }) === null,
  );
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
          value={
            instance.implementation
              ? componentKey(instance.implementation)
              : "default"
          }
          disabled={isDisabled}
          onChange={(value) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: {
                implementation: implementations.find(
                  (item) => item.value === value,
                )?.reference,
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
            ...implementations,
          ]}
        />
      </Tooltip>
    </Form.Field>
  );
};

/** What the instance is an instance of, or why that cannot be read. */
const ComponentField: React.FC = () => {
  const { instance, component } = useComponentInstancePropertiesContext();
  const { imports } = use(CompositionContext);
  const { from, id } = instance.component;

  if (from === undefined) {
    return (
      <Form.Field label="Component" size="sm">
        <div className={hintTextStyle}>
          {component?.name ?? "The referenced component no longer exists."}
        </div>
      </Form.Field>
    );
  }

  const state = imports.get(from);
  const library = state?.status === "resolved" ? state.library.name : from;
  let text = `The import ${from} did not resolve.`;
  if (component) {
    text = `${component.name}, from ${library}`;
  } else if (state?.status === "resolved") {
    text = `${library} has no component ${id}.`;
  } else if (state?.status === "failed") {
    text = `${text} ${state.message}`;
  }
  return (
    <Form.Field label="Component" size="sm">
      <div className={hintTextStyle}>{text}</div>
    </Form.Field>
  );
};

export const ComponentInstanceMainContent: React.FC = () => {
  const { instance, component } = useComponentInstancePropertiesContext();
  const { updateComponentInstance } = usePetrinautMutations();
  const componentParameters = component?.parameters ?? [];
  const isDisabled = useIsReadOnly();
  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={instance.id}
          sourceValue={instance.name}
          validate={validateEntityName}
          onCommit={(name) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: { name },
            })
          }
        />

        <DescriptionField
          sourceId={instance.id}
          sourceValue={instance.description}
          onCommit={(description) =>
            updateComponentInstance({
              instanceId: instance.id,
              update: { description },
            })
          }
        />

        <ComponentField />

        {component && isInterface(component) && <ImplementationField />}
      </Form.Section>

      {componentParameters.length > 0 && (
        <Section title="Parameters">
          <Form.Section>
            {componentParameters.map((param) => (
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

export const ComponentInstanceIcon: React.FC<{ size: number }> = ({ size }) => (
  <Icon name="cube" size={size === 12 ? "xs" : "sm"} />
);

export const ComponentInstanceTitle: React.FC = () => {
  const { component } = useComponentInstancePropertiesContext();
  return (
    <span className={itemTitleStyle}>
      {component?.name ?? "Component"} instance
    </span>
  );
};

export const DeleteComponentInstanceAction: React.FC = () => {
  const { instance } = useComponentInstancePropertiesContext();
  const { removeComponentInstance } = usePetrinautMutations();

  return (
    <DeleteItemButton
      label="Delete component instance"
      onDelete={() => removeComponentInstance({ instanceId: instance.id })}
    />
  );
};
