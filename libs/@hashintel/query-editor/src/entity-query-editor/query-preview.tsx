import { MultiFilter } from "@blockprotocol/graph";
import { Button } from "@mui/material";
import { Stack } from "@mui/system";

interface QueryPreviewProps {
  onSave: (value: MultiFilter) => void;
  onGoBack: () => void;
  onDiscard: () => void;
  query: MultiFilter;
}

export const QueryPreview = ({
  query,
  onDiscard,
  onGoBack,
  onSave,
}: QueryPreviewProps) => {
  return (
    <Stack>
      <div>Query length: {JSON.stringify(query).length}</div>

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
