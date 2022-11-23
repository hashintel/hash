import { FormEvent, useState, FunctionComponent, CSSProperties } from "react";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";
import { SchemaSelectElementType } from "./SchemaEditor";
import { SchemaPropertyRow } from "./SchemaPropertyRow";
import { TextInputOrDisplay } from "./Inputs";
import { SchemaEditorDispatcher } from "./schemaEditorReducer";
import { Button } from "../../../shared/ui";

type SchemaPropertiesTableProps = {
  dispatchSchemaUpdate: SchemaEditorDispatcher;
  GoToSchemaElement: SchemaSelectElementType;
  readonly: boolean;
  selectedSchema: JsonSchema;
};

const cellPadding: CSSProperties = {
  paddingBottom: "1rem",
  paddingLeft: "1rem",
  paddingRight: "2rem",
  paddingTop: "1rem",
};

const thStyle: CSSProperties = {
  position: "sticky",
  ...cellPadding,
  // first:rounded-tl-2xl last:rounded-tr-2xl
};
export const trStyle: CSSProperties = {
  borderRadius: "1rem",
  borderWidth: "1px",
  borderColor: "#F3F4F6",
  // odd:bg-gray-50 even:bg-gray-100
};
export const tdStyle = cellPadding;

export const SchemaPropertiesTable: FunctionComponent<
  SchemaPropertiesTableProps
> = ({ GoToSchemaElement, readonly, selectedSchema, dispatchSchemaUpdate }) => {
  const { properties, required } = selectedSchema;
  const requiredArray = required instanceof Array ? required : undefined;

  const addProperty = (newPropertyName: string) =>
    dispatchSchemaUpdate({
      type: "addProperty",
      payload: { newPropertyName },
    });

  const [newPropertyName, setNewPropertyName] = useState("");

  const onAddPropertyFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newPropertyName.trim()) {
      return false;
    }

    addProperty(newPropertyName);
    setNewPropertyName("");
  };

  return (
    <table
      style={{
        borderCollapse: "separate",
        borderColor: "#F3F4F6",
        borderRadius: "1rem",
        borderSpacing: 0,
        borderWidth: "1px",
        fontSize: "0.875rem",
        lineHeight: "1.25rem",
        maxWidth: "100%",
        textAlign: "left",
        width: "100%",
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>Property</th>
          <th style={thStyle}>Expected Type</th>
          <th style={thStyle}>Description</th>
          <th style={thStyle}>Array</th>
          <th style={thStyle}>Required</th>
          <th style={thStyle}>Constraints</th>
          <th style={thStyle}>Delete</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(properties ?? {})
          ?.sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, propertySchema]) => {
            const isRequired =
              !!requiredArray?.includes(name) || !!propertySchema.required;
            return (
              <SchemaPropertyRow
                dispatchSchemaUpdate={dispatchSchemaUpdate}
                key={name}
                name={name}
                GoToSchemaElement={GoToSchemaElement}
                property={propertySchema}
                readonly={readonly}
                required={isRequired}
              />
            );
          })}
        {!readonly ? (
          <tr style={trStyle}>
            <td style={tdStyle} colSpan={7}>
              <div
                style={{
                  fontWeight: "700",
                  marginBottom: "0.25rem",
                  marginRight: "3rem",
                  textTransform: "uppercase",
                }}
              >
                New property
              </div>
              <form onSubmit={onAddPropertyFormSubmit}>
                <TextInputOrDisplay
                  style={{ width: "16rem" }}
                  placeholder="newProperty"
                  readonly={false}
                  updateText={setNewPropertyName}
                  value={newPropertyName}
                  required
                />
                <br />
                <Button type="submit">Create Property</Button>
              </form>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
};
