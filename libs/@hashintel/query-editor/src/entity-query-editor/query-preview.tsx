import { Entity, MultiFilter } from "@blockprotocol/graph";
import { LoadingSpinner } from "@hashintel/design-system";
import { Button, Typography } from "@mui/material";
import { Stack } from "@mui/system";
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

          <ul>
            {entities.map((entity) => (
              <li key={entity.metadata.recordId.entityId}>
                {Object.values(entity.properties).join(" - ")}
              </li>
            ))}
          </ul>
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
