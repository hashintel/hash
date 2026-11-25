import { useMemo, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { Button, Form, LoadingSpinner, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { findStep } from "../shared/find-step";
import { getSourceEntityTypes } from "../shared/item-name";
import { getKindIcon } from "../shared/value-display";
import { InputField } from "./input-field";
import {
  readPatchesForm,
  readPropertiesForm,
  toPropertiesWithMetadata,
  toPropertyPatches,
} from "./property-rows-field/property-form";
import { PropertyValueInput } from "./property-rows-field/property-value-input";
import { getEntityProperties } from "./shared/condition-properties";
import { AddFilterMenu, UnreadableCondition } from "./shared/condition-rows";
import { readEntityTypeIds, useEntityTypeItems } from "./shared/entity-types";
import { useConditionOntology } from "./shared/use-condition-ontology";
import { useRowKeys } from "./shared/use-row-keys";

import type {
  PropertyRow,
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

const rowControl = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
  minWidth: "0",
});
const opSelect = css({ flexShrink: "0" });
const valueBox = css({ flex: "1", minWidth: "0" });
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
 * Create entity's properties and Update entity's changes, one row per property: a value, or on Update entity, a
 * removal. Saved values the rows can't show are read-only. Lists and properties of several data types aren't offered.
 */
export const PropertyRowsField = (props: ComponentProps<typeof InputField>) => {
  const { editor, flowDefinition, stepId, input, source, problems, readOnly } =
    props;

  const patches =
    "oneOfPayloadKinds" in input &&
    input.oneOfPayloadKinds.includes("PropertyPatch");
  const payloadKind = patches ? "PropertyPatch" : "PropertyObjectWithMetadata";

  /* Picked under Add property, until its row has a value. */
  const [newProperty, setNewProperty] = useState<SettableProperty>();
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  /* By row key, removals switched to Set to, which stay saved as removals until a value is typed. */
  const [settingKeys, setSettingKeys] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const { getRowKey, forgetRowKey } = useRowKeys();

  const ontology = useConditionOntology();
  const { latestEntityTypes } = useEntityTypeItems();

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

  if (source && source.kind !== "constant") {
    return <InputField {...props} />;
  }

  const label = patches ? "Changes" : "Properties";
  const fieldErrors = problems.map(({ code, message }) =>
    code === "missingInput" ? "Required" : message,
  );

  if (!allProperties) {
    return (
      <Form.Field layout="inline" label={label}>
        <LoadingSpinner size="sm" />
      </Form.Field>
    );
  }

  const getValueKind = (baseUrl: BaseUrl) =>
    allProperties.get(baseUrl)?.valueKind;
  const saved = source?.payload.value;
  const form: PropertyRow[] | null = !source
    ? []
    : source.payload.kind !== payloadKind
      ? null
      : patches
        ? readPatchesForm(saved, getValueKind)
        : readPropertiesForm(saved, getValueKind);

  if (!form) {
    return (
      <UnreadableCondition
        label={label}
        value={saved}
        note={`${patches ? "These changes weren't" : "These properties weren't"} made here, so they can't be changed here. The step uses them as they are.`}
        resetLabel={patches ? "Make new changes" : "Set new properties"}
        errors={fieldErrors}
        readOnly={readOnly}
        onReset={() => editor.setInputSource(stepId, input.name, null)}
      />
    );
  }

  const save = (rows: PropertyRow[]) =>
    editor.setInputSource(stepId, input.name, {
      kind: "constant",
      payload: patches
        ? { kind: "PropertyPatch", value: toPropertyPatches(rows) }
        : {
            kind: "PropertyObjectWithMetadata",
            /* Create entity only sets properties. */
            value: toPropertiesWithMetadata(
              rows.filter((row): row is SetRow => row.op === "set"),
            ),
          },
    });

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

  const setSetting = (index: number, setting: boolean) =>
    setSettingKeys((keys) => {
      const key = getRowKey(index);

      if (keys.has(key) === setting) {
        return keys;
      }

      return setting
        ? new Set([...keys, key])
        : new Set([...keys].filter((other) => other !== key));
    });

  const commitRow = (index: number, row: PropertyRow) => {
    setSetting(index, false);

    if (index === form.length) {
      setNewProperty(undefined);
      save([...form, row]);
    } else {
      save(form.with(index, row));
    }
  };

  const removeRow = (index: number) => {
    setRowError(index, undefined);
    setSetting(index, false);
    forgetRowKey(index, rows.length);

    if (index === form.length) {
      setNewProperty(undefined);
    } else {
      save(form.toSpliced(index, 1));
    }
  };

  /* The graph rejects a property the given types don't have. */
  const offeredByBaseUrl =
    givenTypeIds.length > 0 && offeredProperties
      ? new Set(offeredProperties.map(({ baseUrl }) => baseUrl))
      : null;

  const showsAdd = !readOnly && !newProperty;
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

        const op: RowOp =
          row?.op === "remove" && !settingKeys.has(key) ? "remove" : "set";
        const notOnTypes =
          op === "set" &&
          offeredByBaseUrl !== null &&
          !offeredByBaseUrl.has(property.baseUrl);
        const errors = [
          ...(rowErrors.has(key) ? [rowErrors.get(key)!] : []),
          ...(notOnTypes ? ["Not on the entity's types"] : []),
        ];

        const shownErrors = [
          ...errors,
          ...(index === firstShownIndex && !showsAdd ? fieldErrors : []),
        ];

        const value = row?.op === "set" ? row.value : undefined;
        const setValue = (next: RowValue) =>
          commitRow(index, {
            propertyBaseUrl: property.baseUrl,
            op: "set",
            value: next,
            /* A value read back keeps its own data type. */
            dataTypeId:
              row?.op === "set" ? row.dataTypeId : property.dataTypeId,
          });

        const valueInput = (
          <PropertyValueInput
            valueKind={property.valueKind}
            value={value}
            label={property.title}
            readOnly={readOnly}
            autoFocus={row === undefined}
            invalid={errors.length > 0}
            onCommit={setValue}
            onError={(error) => setRowError(index, error)}
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
              !readOnly && (
                <Button
                  variant="ghost"
                  size="xs"
                  iconName="close"
                  aria-label={`Don't ${patches ? "change" : "set"} ${property.title}`}
                  tooltip={patches ? "Don't change" : "Don't set"}
                  onClick={() => removeRow(index)}
                />
              )
            }
          >
            {patches ? (
              <div className={rowControl}>
                <Select<RowOp>
                  required
                  width="fitContent"
                  items={opItems}
                  value={op}
                  disabled={readOnly}
                  aria-label={`What to do with ${property.title}`}
                  className={opSelect}
                  onChange={(nextOp) => {
                    if (nextOp === "remove") {
                      setRowError(index, undefined);
                      commitRow(index, {
                        propertyBaseUrl: property.baseUrl,
                        op: "remove",
                      });
                    } else {
                      setSetting(index, true);
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
