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
import { EditorTitle } from "./entity-query-editor/title";

export interface EntityQueryEditorProps {
  onSave: (value: MultiFilter) => void;
  onDiscard: () => void;
  sx?: BoxProps["sx"];
  entityTypes: EntityType[];
  propertyTypes: PropertyType[];
  defaultValue?: MultiFilter;
  queryEntities: GraphBlockHandler["queryEntities"];
}

export const EntityQueryEditor = ({
  onDiscard,
  onSave,
  entityTypes,
  propertyTypes,
  sx = [],
  defaultValue,
  queryEntities,
}: EntityQueryEditorProps) => {
  const [query, setQuery] = useState(defaultValue);
  const [isEditing, setIsEditing] = useState(!defaultValue);

  return (
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
          onSave={(value) => {
            setQuery(value);
            setIsEditing(false);
          }}
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
  );
};
