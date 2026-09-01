import { useForm, useStore } from "@tanstack/react-form";

import {
  Button,
  Checkbox,
  CheckboxGroup,
  Form,
  Select,
  TextArea,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { Section, SectionList } from "../../../../../components/section";
import { ColorSelect } from "../../shared/color-select";
import { defaultStatusLabelColor } from "./status-view-form-defaults";

import type { StatusViewPlaceOption } from "./status-view-place-options";
import type { Identity } from "@hashintel/petrinaut-core";

// -- Form state ---------------------------------------------------------------

export interface StatusLabelFormState {
  id: string;
  name: string;
  displayColor: string;
  places: string[];
  tokenCondition: string;
  isExit: boolean;
}

export interface StatusViewFormState {
  name: string;
  description: string;
  /** Empty string while no identity is picked. */
  identityRef: string;
  labels: StatusLabelFormState[];
}

// -- Validation ---------------------------------------------------------------

function validateStatusViewForm(
  value: StatusViewFormState,
  existingNames: ReadonlySet<string>,
  knownPlaceIds: ReadonlySet<string> | undefined,
): string | undefined {
  const trimmedName = value.name.trim();
  if (trimmedName === "") {
    return "Status view name is required.";
  }
  if (existingNames.has(trimmedName)) {
    return `A status view named "${trimmedName}" already exists. Choose a unique name.`;
  }
  if (value.identityRef === "") {
    return "Pick the identity this view tracks.";
  }
  if (value.labels.length === 0) {
    return "Add at least one label.";
  }
  const labelNames = new Set<string>();
  let exitLabelSeen = false;
  for (const label of value.labels) {
    const labelName = label.name.trim();
    if (labelName === "") {
      return "Every label needs a name.";
    }
    if (labelNames.has(labelName)) {
      return `Two labels are named "${labelName}". Label names must be unique.`;
    }
    labelNames.add(labelName);
    if (label.isExit) {
      if (exitLabelSeen) {
        return "A status view may declare at most one exit label.";
      }
      exitLabelSeen = true;
      continue;
    }
    if (knownPlaceIds) {
      const danglingPlaceId = label.places.find(
        (placeId) => !knownPlaceIds.has(placeId),
      );
      if (danglingPlaceId !== undefined) {
        return `Label "${labelName}" references a place (\`${danglingPlaceId}\`) that no longer exists in the net.`;
      }
    }
  }
  return undefined;
}

// -- TanStack Form integration -------------------------------------------------

export interface UseStatusViewFormOptions {
  /** Names of other existing status views; the form's name must not match. */
  existingStatusViewNames?: ReadonlySet<string>;
  /**
   * Ids a label place reference may use (the place-picker options). A label
   * referencing anything else — e.g. a place deleted since the view was
   * authored, in an imported document — fails validation with the id named.
   */
  knownPlaceIds?: ReadonlySet<string>;
  /** Exact submit-time HIR validation of the labels' token conditions. */
  validateOnSubmit?: (
    value: StatusViewFormState,
  ) => Promise<string | undefined>;
}

export interface StatusViewFormSubmitContext {
  reset: () => void;
}

export function useStatusViewForm(
  defaultValues: StatusViewFormState,
  onSubmit: (
    values: StatusViewFormState,
    ctx: StatusViewFormSubmitContext,
  ) => void | Promise<void>,
  options: UseStatusViewFormOptions = {},
) {
  const existingNames = options.existingStatusViewNames ?? new Set<string>();
  const knownPlaceIds = options.knownPlaceIds;
  return useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) =>
      await onSubmit(value, { reset: () => formApi.reset() }),
    validators: {
      onChange: ({ value }) =>
        validateStatusViewForm(value, existingNames, knownPlaceIds),
      onSubmit: ({ value }) =>
        validateStatusViewForm(value, existingNames, knownPlaceIds),
      onSubmitAsync: options.validateOnSubmit
        ? async ({ value }) => await options.validateOnSubmit!(value)
        : undefined,
    },
  });
}

export type StatusViewFormInstance = ReturnType<typeof useStatusViewForm>;

// -- Label row -----------------------------------------------------------------

const labelRowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
});

const labelRowHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const labelNameInputStyle = css({
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",
});

const labelColorSelectStyle = css({
  width: "[120px]",
  flexShrink: 0,
});

const conditionInputStyle = css({
  "& input": {
    fontFamily: "mono",
  },
});

const emptyPlacesHintStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontStyle: "italic",
});

const StatusLabelRow = ({
  label,
  index,
  labelCount,
  placeOptions,
  onChange,
  onMove,
  onDelete,
}: {
  label: StatusLabelFormState;
  index: number;
  labelCount: number;
  placeOptions: StatusViewPlaceOption[];
  onChange: (update: Partial<StatusLabelFormState>) => void;
  onMove: (toIndex: number) => void;
  onDelete: () => void;
}) => {
  return (
    <div className={labelRowStyle}>
      <div className={labelRowHeaderStyle}>
        <TextInput
          size="sm"
          width="fullWidth"
          value={label.name}
          placeholder="Label name (Kanban column title)"
          onChange={(name) => onChange({ name })}
          className={labelNameInputStyle}
        />
        <div className={labelColorSelectStyle}>
          <ColorSelect
            value={label.displayColor}
            onChange={(displayColor) => onChange({ displayColor })}
          />
        </div>
        <Button
          size="xxs"
          variant="ghost"
          iconName="chevronUp"
          aria-label={`Move label ${label.name} up`}
          tooltip="Move up"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        />
        <Button
          size="xxs"
          variant="ghost"
          iconName="chevronDown"
          aria-label={`Move label ${label.name} down`}
          tooltip="Move down"
          disabled={index === labelCount - 1}
          onClick={() => onMove(index + 1)}
        />
        <Button
          size="xxs"
          variant="ghost"
          iconName="close"
          aria-label={`Delete label ${label.name}`}
          tooltip="Delete label"
          onClick={onDelete}
        />
      </div>

      <Checkbox
        size="sm"
        label="Exit label — applies to instances whose token left the view's places"
        value={label.isExit}
        onChange={(isExit) => onChange({ isExit })}
      />

      {!label.isExit && (
        <>
          <Form.Field label="Places" size="sm">
            {placeOptions.length === 0 ? (
              <div className={emptyPlacesHintStyle}>
                The net has no places yet.
              </div>
            ) : (
              <CheckboxGroup
                layout="block"
                items={placeOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={label.places}
                onChange={(places) => onChange({ places })}
              />
            )}
          </Form.Field>

          <Form.Field
            label="Token condition"
            size="sm"
            labelTooltip="Optional boolean expression over the token's attributes, e.g. `token.attempts > 0`. The label applies only while the token is in the label's places AND the condition holds."
          >
            <TextInput
              size="sm"
              width="fullWidth"
              value={label.tokenCondition}
              placeholder="token.attempts > 0"
              onChange={(tokenCondition) => onChange({ tokenCondition })}
              className={conditionInputStyle}
            />
          </Form.Field>
        </>
      )}
    </div>
  );
};

// -- Form sections --------------------------------------------------------------

const StatusViewFormSections = ({
  state,
  identities,
  placeOptions,
  onChange,
}: {
  state: StatusViewFormState;
  identities: Identity[];
  placeOptions: StatusViewPlaceOption[];
  onChange: (update: Partial<StatusViewFormState>) => void;
}) => {
  const updateLabel = (
    labelId: string,
    update: Partial<StatusLabelFormState>,
  ) => {
    onChange({
      labels: state.labels.map((label) =>
        label.id === labelId ? { ...label, ...update } : label,
      ),
    });
  };

  const moveLabel = (labelId: string, toIndex: number) => {
    const fromIndex = state.labels.findIndex((label) => label.id === labelId);
    if (fromIndex === -1 || toIndex < 0 || toIndex >= state.labels.length) {
      return;
    }
    const reordered = [...state.labels];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    onChange({ labels: reordered });
  };

  return (
    <SectionList>
      <Section title="General" collapsible defaultOpen>
        <Form.Field label="Status view name" size="sm">
          <TextInput
            size="sm"
            value={state.name}
            onChange={(name) => onChange({ name })}
          />
        </Form.Field>

        <Form.Field label="Description" size="sm">
          <TextArea
            className={css({ minHeight: "[64px]" })}
            size="sm"
            value={state.description}
            onChange={(description) => onChange({ description })}
          />
        </Form.Field>

        <Form.Field
          label="Identity"
          size="sm"
          labelTooltip="The thing this view tracks. Colour elements referencing the identity carry the key that names each instance; create identities from a type's dimension row."
        >
          {identities.length === 0 ? (
            <div className={emptyPlacesHintStyle}>
              No identities yet. Mark a type dimension as an identity key in the
              type's properties first.
            </div>
          ) : (
            <Select
              required
              size="sm"
              value={state.identityRef}
              onChange={(identityRef) => onChange({ identityRef })}
              items={identities.map((identity) => ({
                value: identity.id,
                text: identity.name,
              }))}
            />
          )}
        </Form.Field>
      </Section>

      <Section title="Labels" collapsible defaultOpen>
        <Form.Field
          as="legend"
          label="Labels"
          hideLabel
          size="sm"
          description="Order is the Kanban column order; the first matching label wins per instance."
        >
          <SectionList>
            {state.labels.map((label, index) => (
              <StatusLabelRow
                key={label.id}
                label={label}
                index={index}
                labelCount={state.labels.length}
                placeOptions={placeOptions}
                onChange={(update) => updateLabel(label.id, update)}
                onMove={(toIndex) => moveLabel(label.id, toIndex)}
                onDelete={() =>
                  onChange({
                    labels: state.labels.filter(
                      (candidate) => candidate.id !== label.id,
                    ),
                  })
                }
              />
            ))}
          </SectionList>
        </Form.Field>
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          iconName="plus"
          onClick={() =>
            onChange({
              labels: [
                ...state.labels,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  displayColor: defaultStatusLabelColor,
                  places: [],
                  tokenCondition: "",
                  isExit: false,
                },
              ],
            })
          }
        >
          Add label
        </Button>
      </Section>
    </SectionList>
  );
};

// -- Form body wired to a TanStack form instance --------------------------------

export interface StatusViewFormBodyProps {
  form: StatusViewFormInstance;
  identities: Identity[];
  placeOptions: StatusViewPlaceOption[];
}

export const StatusViewFormBody = ({
  form,
  identities,
  placeOptions,
}: StatusViewFormBodyProps) => {
  const values = useStore(form.store, (state) => state.values);

  return (
    <StatusViewFormSections
      state={values}
      identities={identities}
      placeOptions={placeOptions}
      onChange={(update) => {
        if (update.name !== undefined) {
          form.setFieldValue("name", update.name);
        }
        if (update.description !== undefined) {
          form.setFieldValue("description", update.description);
        }
        if (update.identityRef !== undefined) {
          form.setFieldValue("identityRef", update.identityRef);
        }
        if (update.labels !== undefined) {
          form.setFieldValue("labels", update.labels);
        }
      }}
    />
  );
};
