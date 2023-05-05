import { Entity, MultiFilter } from "@blockprotocol/graph";
import { LoadingSpinner } from "@hashintel/design-system";
import { Button, Card, List, ListItem, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { useReadonlyContext } from "./readonly-context";
import { QueryEntitiesFunc } from "./types";

interface QueryPreviewProps {
  onSave: (value: MultiFilter) => void;
  onGoBack: () => void;
  onDiscard: () => void;
  query: MultiFilter;
  queryEntities: QueryEntitiesFunc;
}

export const QueryPreview = ({
  query,
  onDiscard,
  onGoBack,
  onSave,
  queryEntities,
}: QueryPreviewProps) => {
  const readonly = useReadonlyContext();
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

  return (
    <Stack gap={2.5}>
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div>
          <Typography
            sx={{ fontSize: 32, color: ({ palette }) => palette.gray[70] }}
          >
            Query results are ready
          </Typography>
          <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
            This query returned{" "}
            <span style={{ fontWeight: "bold" }}>{entities.length}</span>{" "}
            entities. See below.
          </Typography>

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
                  <ListItem key={entityUuid}>
                    <b style={{ marginRight: 8 }}>{`- Entity ${index + 1}`}</b>
                    {entityUuid}
                  </ListItem>
                );
              })}
            </List>
          </Card>
        </div>
      )}

      <Stack direction="row" gap={1}>
        {!readonly && <Button onClick={() => onSave(query)}>Save query</Button>}
        <Button
          onClick={onGoBack}
          sx={{ backgroundColor: ({ palette }) => palette.gray[80] }}
        >
          {readonly ? "See" : "Edit"} query
        </Button>
        {!readonly && (
          <Button variant="tertiary" onClick={onDiscard}>
            Discard query
          </Button>
        )}
      </Stack>
    </Stack>
  );
};
