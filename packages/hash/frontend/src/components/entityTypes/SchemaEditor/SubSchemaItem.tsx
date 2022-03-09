import { useRouter } from "next/router";
import { useState, VoidFunctionComponent } from "react";
import { tw } from "twind";

import { JsonSchema } from "../../../lib/json-utils";
import { ConfirmationAlert } from "../../ConfirmationAlert";
import { OldButton } from "../../forms/OldButton";
import { SchemaSelectElementType } from "./SchemaEditor";
import {
  getSubschemaDependentProperties,
  SchemaEditorReducerAction,
} from "./schemaEditorReducer";

type SubSchemaItemProps = {
  dispatchSchemaUpdate: (action: SchemaEditorReducerAction) => void;
  GoToSchemaElement: SchemaSelectElementType;
  subSchema: [string, JsonSchema];
  subSchemaReference: string | undefined;
  workingSchemaDraft: JsonSchema;
};

export const SubSchemaItem: VoidFunctionComponent<SubSchemaItemProps> = ({
  dispatchSchemaUpdate,
  GoToSchemaElement,
  subSchema,
  subSchemaReference,
  workingSchemaDraft,
}) => {
  // @todo remove router usage from SchemaEditor (so it can be more easily used elsewhere)
  const router = useRouter();

  const subSchemaName = subSchema[0];

  type AlertState = {
    open: boolean;
    subSchemaUsedInProperties: Array<string>;
  };

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    subSchemaUsedInProperties: [],
  });

  const updateAlertState = (newAlertState: Partial<AlertState>) => {
    setAlertState((oldAlertState) => ({
      ...oldAlertState,
      ...newAlertState,
    }));
  };

  const showAlert = (subSchemaUsedInProperties: Array<string>) => {
    setAlertState({ open: true, subSchemaUsedInProperties });
  };

  const clearAlert = () => {
    updateAlertState({
      open: false,
      subSchemaUsedInProperties: [],
    });
  };

  const continueDeletingSubSchemaItem = () => {
    dispatchSchemaUpdate({
      type: "deleteSubSchema",
      payload: { subSchemaName },
    });

    clearAlert();

    if (subSchemaReference?.split("/").pop() === subSchemaName) {
      return router.push(workingSchemaDraft.$id ?? "#");
    }
  };

  const deleteSubschemaItem = (subSchemaNameToDelete: string) => {
    const dependentProperties = getSubschemaDependentProperties(
      workingSchemaDraft,
      subSchemaNameToDelete,
    );

    if (dependentProperties.length > 0) {
      return showAlert(
        dependentProperties.map((property) => {
          // Join path to property using arrows
          if (Array.isArray(property)) {
            return property.join(" 🡒 ");
          }

          // Return propertyname directly
          return property;
        }),
      );
    }

    return continueDeletingSubSchemaItem();
  };

  return (
    <div className={tw`mb-4`} key={subSchemaName}>
      <GoToSchemaElement schemaRef={`#/$defs/${subSchemaName}`} />
      <OldButton
        onClick={() => deleteSubschemaItem(subSchemaName)}
        className={tw`ml-4`}
        danger
      >
        Delete Subschema
      </OldButton>
      <ConfirmationAlert
        title={`Are you sure you want to delete ${subSchemaName}?`}
        open={alertState.open}
        onClose={clearAlert}
        onContinue={continueDeletingSubSchemaItem}
      >
        <p>
          The expected type for these properties would change to{" "}
          <code>string</code>
        </p>

        <p>
          <ul>
            {alertState.subSchemaUsedInProperties.map((propertyName) => (
              <li key={propertyName}>• {propertyName}</li>
            ))}
          </ul>
        </p>
      </ConfirmationAlert>
    </div>
  );
};
