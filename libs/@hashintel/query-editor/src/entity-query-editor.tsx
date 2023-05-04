import {
  EntityType,
  GraphBlockHandler,
  MultiFilter,
  PropertyType,
} from "@blockprotocol/graph";
import { Stack } from "@mui/material";
import { BoxProps } from "@mui/system";
import { useState } from "react";

import { QueryForm } from "./entity-query-editor/query-form";
import { QueryPreview } from "./entity-query-editor/query-preview";
import { ReadonlyContextProvider } from "./entity-query-editor/readonly-context";
import { EditorTitle } from "./entity-query-editor/title";

export interface EntityQueryEditorProps {
  onSave: (value: MultiFilter) => void;
  onDiscard: () => void;
  sx?: BoxProps["sx"];
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
  queryEntities: GraphBlockHandler["queryEntities"];
  readonly?: boolean;
}

export const EntityQueryEditor = ({
  onDiscard,
  onSave,
  entityTypes,
  propertyTypes,
  sx = [],
  defaultValue,
  queryEntities,
  readonly,
}: EntityQueryEditorProps) => {
  const [query, setQuery] = useState(defaultValue);
  const [isEditing, setIsEditing] = useState(!defaultValue);

  return (
    <ReadonlyContextProvider readonly={!!readonly}>
      <Stack
        gap={2.5}
        sx={[
          {
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            p: 2.5,
            borderRadius: 2,
            background: "white",
            overflowX: "auto",
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <EditorTitle />

        {isEditing ? (
          <QueryForm
            entityTypes={entityTypes}
            propertyTypes={propertyTypes}
            onDiscard={() => {
              if (query) {
                return setIsEditing(false);
              }

              onDiscard();
            }}
            onPreview={(value) => {
              setQuery(value);
              setIsEditing(false);
            }}
            onSave={onSave}
            defaultValue={query}
          />
        ) : (
          <QueryPreview
            /** @todo if not editing, %100 there should be a `query`, need to use TS property for this situation */
            query={query!}
            onDiscard={onDiscard}
            onSave={onSave}
            onGoBack={() => setIsEditing(true)}
            queryEntities={queryEntities}
          />
        )}
      </Stack>
    </ReadonlyContextProvider>
  );
};
