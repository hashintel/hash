import { useMemo, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { Button, Form, LoadingSpinner, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isBuiltSource } from "@local/hash-isomorphic-utils/flows/built-sources";

import { findStep } from "../shared/find-step";
import { getSourceEntityTypes, useItemNames } from "../shared/item-name";
import { getKindIcon } from "../shared/value-display";
import { getPathInSource } from "./field-problems";
import { InputField } from "./input-field";
import { brokenSourceCodes } from "./input-sources";
import {
  getProblemRowIndex,
  readPatchesForm,
  readPropertiesForm,
  toPatchesSource,
  toPropertiesSource,
} from "./property-rows-field/property-form";
import { PropertyValuePicker } from "./property-rows-field/property-value-picker";
import { getEntityProperties } from "./shared/condition-properties";
import { AddFilterMenu, UnreadableCondition } from "./shared/condition-rows";
import { readEntityTypeIds, useEntityTypeItems } from "./shared/entity-types";
import { useConditionOntology } from "./shared/use-condition-ontology";
import { useRowKeys } from "./shared/use-row-keys";

import type {
  PropertyRow,
  RowSource,
  RowValue,
  SetRow,
} from "./property-rows-field/property-form";
import type { EntityProperty } from "./shared/condition-properties";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";
import type { ComponentProps } from "react";

/** A property a row can set, with the data type its value is saved as. */
type SettableProperty = EntityProperty & { dataTypeId: VersionedUrl };

type RowOp = PropertyRow["op"];

const opItems: { value: RowOp; text: string }[] = [
  { value: "set", text: "Set to" },
  { value: "remove", text: "Remove" },
];

/* The value goes under what's done with the property: beside it, there's no room to read where a value comes from. */
const rowControl = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  width: "full",
  minWidth: "0",
});
const valueBox = css({ width: "full", minWidth: "0" });
const addButton = css({ alignSelf: "flex-start" });

const getIcon = ({ valueKind }: EntityProperty): IconName =>
  valueKind.kind === "Text" && valueKind.options
    ? "list"
    : getKindIcon({ payloadKind: valueKind.kind, array: false });

/** A saved row, or the one being added, which has no value yet. */
type ShownRow =
  | { saved: PropertyRow; property: SettableProperty | undefined }
  | { saved: undefined; property: SettableProperty };

/**
 * Create entity's properties and Update entity's changes, one row per property: a value, typed or taken from a flow
 * input or an earlier step, or on Update entity, a removal. Saved values the rows can't show are read-only. Lists and
 * properties of several data types aren't offered.
 */
export const PropertyRowsField = (props: ComponentProps<typeof InputField>) => {
  const {
    editor,
    flowDefinition,
    stepId,
    input,
    source,
    problems,
    onSelectStart,
  } = props;

  const patches =
    "oneOfPayloadKinds" in input &&
    input.oneOfPayloadKinds.includes("PropertyPatch");

  /* Picked under Add property, until its row has a value. */
  const [newProperty, setNewProperty] = useState<SettableProperty>();
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  const { getRowKey, forgetRowKey } = useRowKeys();

  const ontology = useConditionOntology();
  const { latestEntityTypes } = useEntityTypeItems();
  const getItemName = useItemNames(flowDefinition);

  const getSettable = useMemo(
    () =>
      ontology &&
      ((entityTypeIds: VersionedUrl[]) =>
        getEntityProperties(ontology, entityTypeIds).flatMap(
          (property): SettableProperty[] => {
            const dataTypeId = ontology.latestDataTypeIds.get(property.baseUrl);

            return dataTypeId ? [{ ...property, dataTypeId }] : [];
          },
        )),
    [ontology],
  );

  const allProperties = useMemo(
    () =>
      getSettable &&
      latestEntityTypes &&
      new Map(
        getSettable(latestEntityTypes.map(({ schema }) => schema.$id)).map(
          (property) => [property.baseUrl, property],
        ),
      ),
    [getSettable, latestEntityTypes],
  );

  /* Offered: the given types' properties, else on Update entity those of the query the entity comes from, else all. */
  const step = findStep(flowDefinition.steps, stepId)?.step;
  const stepInputs = step?.kind === "action" ? step.inputs : {};
  const typesSource = stepInputs.entityTypeIds;
  const givenTypeIds =
    (typesSource?.kind === "constant"
      ? readEntityTypeIds(typesSource.payload.value)
      : null) ?? [];
  const offeredBaseUrls =
    givenTypeIds.length > 0
      ? givenTypeIds.map(extractBaseUrl)
      : patches
        ? getSourceEntityTypes(flowDefinition, stepId, stepInputs.entityId)
        : [];
  const offeredKey = offeredBaseUrls.join(" ");
  const offeredProperties = useMemo(
    () =>
      offeredKey === ""
        ? null
        : getSettable &&
          latestEntityTypes &&
          getSettable(
            latestEntityTypes
              .filter(({ metadata }) =>
                offeredKey.split(" ").includes(metadata.recordId.baseUrl),
              )
              .map(({ schema }) => schema.$id),
          ),
    [offeredKey, getSettable, latestEntityTypes],
  );

  /* The whole input connected to one value shows as any connected input does. */
  if (source && source.kind !== "constant" && !isBuiltSource(source)) {
    return <InputField {...props} />;
  }

  const label = patches ? "Changes" : "Properties";
  const getError = ({ code, message }: (typeof problems)[number]) =>
    code === "missingInput" ? "Required" : message;

  if (!allProperties) {
    return (
      <Form.Field layout="inline" label={label}>
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const getValueKind = (baseUrl: BaseUrl) =>
    allProperties.get(baseUrl)?.valueKind;
  const form: PropertyRow[] | null = !source
    ? []
    : patches
      ? readPatchesForm(source, getValueKind)
      : readPropertiesForm(source, getValueKind);

  if (!form) {
    return (
      <UnreadableCondition
        label={label}
        value={source?.kind === "constant" ? source.payload.value : source}
        note={`${patches ? "These changes weren't" : "These properties weren't"} made here, so they can't be changed here. The step uses them as they are.`}
        resetLabel={patches ? "Make new changes" : "Set new properties"}
        errors={problems.map(getError)}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  /* A problem with one row's value shows on its row, the rest on the field. */
  const problemRows = problems.map((problem) => ({
    problem,
    rowIndex: getProblemRowIndex(getPathInSource(problem), form),
  }));
  const fieldErrors = problemRows
    .filter(({ rowIndex }) => rowIndex === undefined)
    .map(({ problem }) => getError(problem));

  const save = (rows: PropertyRow[]) =>
    editor.setInputSource(
      stepId,
      input.name,
      patches
        ? toPatchesSource(rows)
        : /* Create entity only sets properties. */
          toPropertiesSource(
            rows.filter((row): row is SetRow => row.op === "set"),
          ),
    );

  const rows: ShownRow[] = [
    ...form.map((row) => ({
      saved: row,
      property: allProperties.get(row.propertyBaseUrl),
    })),
    ...(newProperty ? [{ saved: undefined, property: newProperty }] : []),
  ];

  const setRowError = (index: number, error: string | undefined) =>
    setRowErrors((errors) => {
      const key = getRowKey(index);

      if (errors.get(key) === error) {
        return errors;
      }

      const next = new Map(errors);

      if (error === undefined) {
        next.delete(key);
      } else {
        next.set(key, error);
      }

      return next;
    });

  const commitRow = (index: number, row: PropertyRow) => {
    if (index === form.length) {
      setNewProperty(undefined);
      save([...form, row]);
    } else {
      save(form.with(index, row));
    }
  };

  /** Drops the row at `index`, or with `keepProperty`, only its value: its property is then the one being added. */
  const removeRow = (index: number, keepProperty?: SettableProperty) => {
    setRowError(index, undefined);
    forgetRowKey(index, rows.length);

    if (index < form.length) {
      save(form.toSpliced(index, 1));
    }

    if (keepProperty || index === form.length) {
      /* A property being added gives way to the kept one, with whatever was wrong with what was typed for it. */
      setRowError(form.length, undefined);
      setNewProperty(keepProperty);
    }
  };

  /* The graph rejects a property the given types don't have. */
  const offeredByBaseUrl =
    givenTypeIds.length > 0 && offeredProperties
      ? new Set(offeredProperties.map(({ baseUrl }) => baseUrl))
      : null;

  const showsAdd = !newProperty;
  const firstShownIndex = rows.findIndex(({ property }) => property);
  const used = new Set(rows.map(({ property }) => property?.baseUrl));
  const options = (
    offeredProperties ?? (patches ? [...allProperties.values()] : [])
  )
    .filter(({ baseUrl }) => !used.has(baseUrl))
    .map((property) => ({ ...property, key: property.baseUrl }));

  return (
    <>
      {/* Problems with the whole input show under the add button, or under the first row when it isn't shown. */}
      {!showsAdd && firstShownIndex === -1 && fieldErrors.length > 0 && (
        <Form.Field layout="inline" label={label} errors={fieldErrors}>
          {null}
        </Form.Field>
      )}
      {rows.map(({ saved: row, property }, index) => {
        const key = getRowKey(index);

        if (!property) {
          return null;
        }

        const op: RowOp = row?.op === "remove" ? "remove" : "set";
        const notOnTypes =
          op === "set" &&
          offeredByBaseUrl !== null &&
          !offeredByBaseUrl.has(property.baseUrl);
        const rowProblems = problemRows.flatMap(({ problem, rowIndex }) =>
          rowIndex === index ? [problem] : [],
        );
        const brokenProblem = rowProblems.find(({ code }) =>
          brokenSourceCodes.has(code),
        );
        const errors = [
          ...(rowErrors.has(key) ? [rowErrors.get(key)!] : []),
          ...(notOnTypes ? ["Not on the entity's types"] : []),
          ...rowProblems
            .filter((problem) => problem !== brokenProblem)
            .map(getError),
        ];

        const shownErrors = [
          ...errors,
          ...(index === firstShownIndex && !showsAdd ? fieldErrors : []),
        ];

        const setRow = row?.op === "set" ? row : undefined;
        const setValue = (next: { value: RowValue } | { from: RowSource }) =>
          commitRow(index, {
            propertyBaseUrl: property.baseUrl,
            op: "set",
            /* A value read back keeps its own data type. */
            dataTypeId: setRow?.dataTypeId ?? property.dataTypeId,
            ...next,
          });

        const valueInput = (
          <PropertyValuePicker
            /* A row that takes the place of the one being added doesn't take over what was being typed for it. */
            key={property.baseUrl}
            editor={editor}
            flowDefinition={flowDefinition}
            stepId={stepId}
            property={property}
            value={setRow?.value}
            from={setRow?.from}
            brokenProblem={brokenProblem}
            invalid={errors.length > 0}
            getItemName={getItemName}
            onPick={(from) => setValue({ from })}
            onType={(value) => setValue({ value })}
            onClear={() => removeRow(index, property)}
            onError={(error) => setRowError(index, error)}
            onSelectStart={onSelectStart}
          />
        );

        return (
          <Form.Field
            key={key}
            layout="inline"
            as="legend"
            label={property.title}
            errors={shownErrors.length > 0 ? shownErrors : undefined}
            labelActions={
              <Button
                variant="ghost"
                size="xs"
                iconName="close"
                aria-label={`Don't ${patches ? "change" : "set"} ${property.title}`}
                tooltip={patches ? "Don't change" : "Don't set"}
                onClick={() => removeRow(index)}
              />
            }
          >
            {patches ? (
              <div className={rowControl}>
                <Select<RowOp>
                  required
                  width="fitContent"
                  items={opItems}
                  value={op}
                  aria-label={`What to do with ${property.title}`}
                  onChange={(nextOp) => {
                    if (nextOp === "remove") {
                      setRowError(index, undefined);
                      commitRow(index, {
                        propertyBaseUrl: property.baseUrl,
                        op: "remove",
                      });
                    } else {
                      /* The removal is dropped, so a run before a value is given doesn't remove the property. */
                      removeRow(index, property);
                    }
                  }}
                />
                {op === "set" && <div className={valueBox}>{valueInput}</div>}
              </div>
            ) : (
              valueInput
            )}
          </Form.Field>
        );
      })}
      {showsAdd && (
        <Form.Field
          layout="inline"
          as="legend"
          label={rows.length === 0 ? label : ""}
          errors={fieldErrors.length > 0 ? fieldErrors : undefined}
        >
          <AddFilterMenu
            options={options}
            getIcon={getIcon}
            emptyText={
              offeredProperties || patches
                ? "No more properties can be set here"
                : "Choose the entity type first"
            }
            trigger={
              <Button
                variant="ghost"
                size="sm"
                iconName="plus"
                className={addButton}
              >
                Add property
              </Button>
            }
            onPick={setNewProperty}
          />
        </Form.Field>
      )}
    </>
  );
};
