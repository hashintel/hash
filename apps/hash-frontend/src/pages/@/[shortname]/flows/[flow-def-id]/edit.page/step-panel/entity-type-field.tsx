import { extractBaseUrl } from "@blockprotocol/type-system";
import { Form, LoadingSpinner, Select } from "@hashintel/ds-components";

import { findStep } from "../shared/find-step";
import { getNameLabel } from "../shared/name-label";
import { InputField } from "./input-field";
import { UnreadableCondition } from "./shared/condition-rows";
import { readEntityTypeIds, useEntityTypeItems } from "./shared/entity-types";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { StepInputSource } from "@local/hash-isomorphic-utils/flows/types";
import type { ComponentProps } from "react";

/** By action: the field's label, and the changes input that picking types sets to empty when it has no value. */
const entityTypeInputs: Partial<
  Record<
    string,
    {
      label: string;
      placeholder?: string;
      changes: { inputName: string; none: StepInputSource };
    }
  >
> = {
  createEntity: {
    label: "Entity type",
    changes: {
      inputName: "properties",
      none: {
        kind: "constant",
        payload: { kind: "PropertyObjectWithMetadata", value: { value: {} } },
      },
    },
  },
  /* The types replace the entity's own. */
  updateEntity: {
    label: "Change type to",
    placeholder: "Keep its types",
    changes: {
      inputName: "propertyPatches",
      none: {
        kind: "constant",
        payload: { kind: "PropertyPatch", value: [] },
      },
    },
  },
};

/** Entity types, picked by name. A saved type keeps its version; a newly picked one is the latest. */
export const EntityTypeField = (props: ComponentProps<typeof InputField>) => {
  const {
    editor,
    flowDefinition,
    stepId,
    input,
    actionDefinition,
    source,
    problems,
  } = props;

  const { latestEntityTypes, typeItems } = useEntityTypeItems();

  if (source && source.kind !== "constant") {
    return <InputField {...props} />;
  }

  const settings = entityTypeInputs[actionDefinition.actionDefinitionId];
  const label = settings?.label ?? getNameLabel(input.name);
  const errors = problems.map(({ code, message }) =>
    code === "missingInput" ? "Required" : message,
  );

  if (!latestEntityTypes) {
    return (
      <Form.Field layout="inline" label={label}>
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const entityTypeIds = source
    ? source.payload.kind === "VersionedUrl"
      ? readEntityTypeIds(source.payload.value)
      : null
    : [];
  const known = new Set(typeItems.map(({ value }) => value));

  if (
    !entityTypeIds ||
    entityTypeIds.some(
      (entityTypeId) => !known.has(extractBaseUrl(entityTypeId)),
    )
  ) {
    return (
      <UnreadableCondition
        label={label}
        value={source?.payload.value}
        note="These types can't be shown here, so they can't be changed here. The step uses them as they are."
        resetLabel="Choose new types"
        errors={errors}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  const latestIds = new Map(
    latestEntityTypes.map(({ metadata, schema }) => [
      metadata.recordId.baseUrl,
      schema.$id,
    ]),
  );

  const save = (baseUrls: BaseUrl[]) => {
    const next = baseUrls.flatMap((baseUrl): VersionedUrl[] => {
      const id =
        entityTypeIds.find(
          (entityTypeId) => extractBaseUrl(entityTypeId) === baseUrl,
        ) ?? latestIds.get(baseUrl);

      return id ? [id] : [];
    });

    editor.setInputSource(
      stepId,
      input.name,
      next.length > 0
        ? { kind: "constant", payload: { kind: "VersionedUrl", value: next } }
        : null,
    );

    const step = findStep(flowDefinition.steps, stepId)?.step;

    if (
      next.length > 0 &&
      settings &&
      step?.kind === "action" &&
      !step.inputs[settings.changes.inputName]
    ) {
      editor.setInputSource(
        stepId,
        settings.changes.inputName,
        settings.changes.none,
      );
    }
  };

  return (
    <Form.Field
      layout="inline"
      label={label}
      errors={errors.length > 0 ? errors : undefined}
    >
      <Select<BaseUrl>
        multiple
        searchable={{ hideSelectAllToggle: true }}
        items={typeItems}
        value={entityTypeIds.map(extractBaseUrl)}
        placeholder={settings?.placeholder ?? "Choose…"}
        aria-label={label}
        onChange={save}
      />
    </Form.Field>
  );
};
