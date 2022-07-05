import { JsonObject } from "@blockprotocol/core";
import {
  EmbedderGraphMessageCallbacks,
  EntityType,
} from "@blockprotocol/graph";
import React, {
  createContext,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  VoidFunctionComponent,
} from "react";
import { tw } from "twind";
import { debounce, get } from "lodash";

import { JsonSchema } from "@hashintel/hash-shared/json-utils";
import { SchemaPropertiesTable } from "./SchemaPropertiesTable";
import { TextInputOrDisplay } from "./Inputs";
import {
  schemaEditorReducer,
  SchemaEditorReducerAction,
} from "./schemaEditorReducer";
import { SubSchemaItem } from "./SubSchemaItem";
import { Button, Link } from "../../../shared/ui";

export type SchemaSelectElementType = VoidFunctionComponent<{
  schemaRef: string;
}>;

export const SchemaOptionsContext = createContext<{
  availableEntityTypes: EntityType[];
  subSchemas: [string, JsonSchema][];
} | null>(null);

type JsonSchemaEditorProps = {
  aggregateEntityTypes: EmbedderGraphMessageCallbacks["aggregateEntityTypes"];
  GoToSchemaElement: SchemaSelectElementType;
  subSchemaReference?: string;
  updateEntityType: EmbedderGraphMessageCallbacks["updateEntityType"];
} & EntityType;

const entityTypeIdMatchesSchema = (entityTypeId: string, schema: JsonSchema) =>
  !!schema.$id?.includes(entityTypeId);

export const SchemaEditor: VoidFunctionComponent<JsonSchemaEditorProps> = ({
  aggregateEntityTypes,
  entityTypeId,
  GoToSchemaElement,
  schema: possiblyStaleDbSchema,
  subSchemaReference,
  updateEntityType,
}) => {
  const [availableEntityTypes, setAvailableEntityTypes] = useState<
    EntityType[] | undefined
  >(undefined);

  useEffect(() => {
    if (aggregateEntityTypes) {
      aggregateEntityTypes({
        data: {
          includeOtherTypesInUse: true,
        },
      })
        .then((response) => setAvailableEntityTypes(response.data?.results))
        .catch((err) =>
          // eslint-disable-next-line no-console -- TODO: consider using logger
          console.error(`Error fetching entity type options: ${err.message}`),
        );
    }
  }, [aggregateEntityTypes]);

  // The user will be working with a draft in local state, to enable optimistic UI and handle fast/competing updates
  const [workingSchemaDraft, dispatch] = useReducer(
    schemaEditorReducer,
    possiblyStaleDbSchema,
  );

  if (
    entityTypeId &&
    !entityTypeIdMatchesSchema(entityTypeId, workingSchemaDraft)
  ) {
    dispatch({ payload: { schema: possiblyStaleDbSchema }, type: "init" });
  }

  const debouncedUpdate = useMemo(
    () =>
      debounce<EmbedderGraphMessageCallbacks["updateEntityType"]>((...args) => {
        if (!updateEntityType) {
          throw new Error(
            "updateEntityType function not provided. Schema cannot be updated.",
          );
        }
        return updateEntityType(...args);
      }, 800),
    [updateEntityType],
  );

  useEffect(() => {
    if (!entityTypeId) {
      throw new Error("entityTypeId not provided. Schema cannot be updated.");
    }

    if (
      JSON.stringify(workingSchemaDraft) ===
        JSON.stringify(possiblyStaleDbSchema) ||
      /**
       * this effect may be triggered when navigating between tasks, which can lead to
       * the prev task's data being sent with the entityTypeId of the new task.
       * really we should send updates to the API in response to user action, not in an effect.
       * @todo send updates when dispatching user actions, and remove this effect
       *    - make sure switching tasks can't result in updates being sent for the wrong task.
       */
      !entityTypeIdMatchesSchema(entityTypeId, workingSchemaDraft)
    ) {
      return;
    }
    // Send updates to the API periodically when the draft is updated
    debouncedUpdate({
      data: {
        entityTypeId,
        schema: workingSchemaDraft as JsonObject,
      },
    })?.catch((err) => {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error(`Error updating schema: ${err.message}`);
      throw err;
    });
  }, [
    debouncedUpdate,
    entityTypeId,
    possiblyStaleDbSchema,
    workingSchemaDraft,
  ]);

  useEffect(
    () => () => {
      // fire off any pending updates
      debouncedUpdate.flush()?.catch((err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(`Error updating schema: ${err.message}`);
        throw err;
      });
    },
    [debouncedUpdate],
  );

  // Strip the leading #/ and replace namespace separator / with dots, for use in lodash get/set methods
  const pathToSubSchema = subSchemaReference
    ?.replace(/^#\//, "")
    .replace(/\//g, ".");

  const dispatchSchemaUpdate = useCallback(
    (action: SchemaEditorReducerAction) => {
      if (pathToSubSchema && action.type !== "addSubSchema") {
        // don't support sub-schemas with their own sub-schemas for now. the UI doesn't handle it
        // eslint-disable-next-line no-param-reassign
        action.payload.pathToSubSchema = pathToSubSchema;
      }
      dispatch(action);
    },
    [dispatch, pathToSubSchema],
  );

  const subSchemas = Object.entries(workingSchemaDraft.$defs ?? []);

  const schemaOptions = useMemo(
    () => ({
      availableEntityTypes: availableEntityTypes ?? [],
      subSchemas,
    }),
    [availableEntityTypes, subSchemas],
  );

  /**
   * @todo deal with $anchors https://json-schema.org/understanding-json-schema/structuring.html#anchor
   */
  const selectedSchema: JsonSchema = pathToSubSchema
    ? get(workingSchemaDraft, pathToSubSchema)
    : workingSchemaDraft;

  const { title } = workingSchemaDraft;
  const { description } = selectedSchema;

  const readonly = !updateEntityType || !entityTypeId;

  const addSubSchema = (newSubSchemaName: string) =>
    dispatchSchemaUpdate({
      type: "addSubSchema",
      payload: { newSubSchemaName },
    });

  const [newSubSchemaName, setNewSubSchemaName] = useState("");

  const onNewSubSchemaFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newSubSchemaName.trim()) {
      return;
    }

    addSubSchema(newSubSchemaName);
    setNewSubSchemaName("");
  };

  const updateSchemaDescription = (newSchemaDescription: string) => {
    return dispatchSchemaUpdate({
      type: "updateSchemaDescription",
      payload: { newSchemaDescription },
    });
  };

  return (
    <div>
      <header className={tw`mb-12`}>
        <h1>
          <strong>Schema: {title ?? "No title."}</strong>
        </h1>
      </header>

      <section>
        <div className={tw`flex items-center mb-7`}>
          <h2>
            Properties of{" "}
            <Link noLinkStyle href={workingSchemaDraft.$id ?? "#"}>
              {title}
            </Link>
          </h2>
          {subSchemaReference ? (
            <h3 className={tw`ml-2`}>{` > ${subSchemaReference
              .split("/")
              .pop()}`}</h3>
          ) : null}
        </div>
        <div className={tw`mb-4`}>
          <TextInputOrDisplay
            className={tw`max-w-3xl`}
            placeholder="Describe your schema"
            readonly={readonly}
            updateText={updateSchemaDescription}
            value={description ?? ""}
            updateOnBlur
          />
        </div>
        <div>
          {!availableEntityTypes ? (
            "Loading..."
          ) : (
            <SchemaOptionsContext.Provider value={schemaOptions}>
              <SchemaPropertiesTable
                selectedSchema={selectedSchema}
                GoToSchemaElement={GoToSchemaElement}
                readonly={readonly}
                dispatchSchemaUpdate={dispatchSchemaUpdate}
              />
            </SchemaOptionsContext.Provider>
          )}
        </div>
      </section>

      {subSchemas.length > 0 ? (
        <section className={tw`mt-8`}>
          <h2>Sub-schemas in {title}</h2>
          {subSchemas.map((subSchema) => (
            <SubSchemaItem
              dispatchSchemaUpdate={dispatchSchemaUpdate}
              GoToSchemaElement={GoToSchemaElement}
              key={subSchema[0]}
              subSchema={subSchema}
              subSchemaReference={subSchemaReference}
              workingSchemaDraft={workingSchemaDraft}
            />
          ))}
          <div className={tw`mt-8`}>
            <div className={tw`text-uppercase font-bold text-sm mr-12 mb-1`}>
              New sub-schema
            </div>
            <form onSubmit={onNewSubSchemaFormSubmit}>
              <TextInputOrDisplay
                className={tw`w-64`}
                required
                placeholder="MySubSchema"
                readonly={false}
                updateText={(value) => setNewSubSchemaName(value)}
                value={newSubSchemaName}
              />
              <br />
              <Button type="submit">Create Sub-schema</Button>
            </form>
          </div>
          )
        </section>
      ) : null}
    </div>
  );
};
