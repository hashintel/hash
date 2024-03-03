import { Entity, MultiFilter } from "@blockprotocol/graph";
import { LoadingSpinner } from "@hashintel/design-system";
import { Card, List, ListItem, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { QueryEntitiesFunc } from "./types";

interface QueryPreviewProps {
  query: MultiFilter;
  queryEntities: QueryEntitiesFunc;
}

export const QueryPreview = ({ query, queryEntities }: QueryPreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await queryEntities(query);
        setEntities(res);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [query, queryEntities]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasEntities = !!entities.length;

  return (
    <div>
      <Typography
        sx={{ fontSize: 32, color: ({ palette }) => palette.gray[70] }}
      >
        Query results are ready
      </Typography>
      <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
        This query returned{" "}
        <span style={{ fontWeight: "bold" }}>{entities.length}</span> entities.
        {hasEntities && "See below."}
      </Typography>

      {hasEntities && (
        <Card
          sx={{ my: 2, background: ({ palette }) => palette.gray[10] }}
          elevation={2}
        >
          <List
            sx={{
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {entities.map((entity, index) => {
              const entityUuid =
                entity.metadata.recordId.entityId.split("%")[1];

              return (
                <ListItem key={entity.metadata.recordId.entityId}>
                  <b style={{ marginRight: 8 }}>{`- Entity ${index + 1}`}</b>
                  {entityUuid}
                </ListItem>
              );
            })}
          </List>
        </Card>
      )}
    </div>
  );
};
