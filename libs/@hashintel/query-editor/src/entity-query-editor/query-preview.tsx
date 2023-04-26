import { Entity, GraphBlockHandler, MultiFilter } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { LoadingSpinner } from "@hashintel/design-system";
import { Button, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import { useEffect, useState } from "react";

interface QueryPreviewProps {
  onSave: (value: MultiFilter) => void;
  onGoBack: () => void;
  onDiscard: () => void;
  query: MultiFilter;
  queryEntities: GraphBlockHandler["queryEntities"];
}

export const QueryPreview = ({
  query,
  onDiscard,
  onGoBack,
  onSave,
  queryEntities,
}: QueryPreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    const init = async () => {
      const res = await queryEntities({
        data: { operation: { multiFilter: query } },
      });

      if (res.data) {
        const subgraph = res.data.results;
        setEntities(getRoots(subgraph));
      }

      setLoading(false);
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
        <Button onClick={() => onSave(query)}>Add entities to table</Button>
        <Button
          onClick={onGoBack}
          sx={{ backgroundColor: ({ palette }) => palette.gray[80] }}
        >
          Go back and refine query
        </Button>
        <Button variant="tertiary" onClick={onDiscard}>
          Discard query and cancel
        </Button>
      </Stack>
    </Stack>
  );
};
