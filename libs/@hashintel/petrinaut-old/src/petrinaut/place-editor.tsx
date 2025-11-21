import { TextField } from "@hashintel/design-system";
import { Box, Button, Card, Stack, Typography } from "@mui/material";

import type { PlaceNodeType, TokenCounts, TokenType } from "./types";

export type PlaceEditorProps = {
  selectedPlace: PlaceNodeType;
  tokenTypes: TokenType[];
  onClose: () => void;
  onUpdateInitialTokens: (nodeId: string, tokenCounts: TokenCounts) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  position: { x: number; y: number };
};

export const PlaceEditor = ({
  position,
  selectedPlace,
  tokenTypes,
  onClose,
  onUpdateInitialTokens,
  onUpdateNodeLabel,
}: PlaceEditorProps) => {
  const { data, id: placeId } = selectedPlace;
  const { label: nodeName, initialTokenCounts } = data;

  const handleTokenCountChange = (tokenTypeId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const newCount = Number.isNaN(numValue) ? 0 : Math.max(0, numValue);

    const newTokenCounts = {
      ...initialTokenCounts,
      [tokenTypeId]: newCount,
    };

    onUpdateInitialTokens(placeId, newTokenCounts);
  };

  const handleNodeNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    onUpdateNodeLabel(placeId, newName);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <Card
      sx={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        px: 2,
        pt: 1,
        pb: 1.5,
        boxShadow: 3,
      }}
    >
      <Stack spacing={2}>
        <Box component="label">
          <Typography variant="smallCaps" sx={{ fontWeight: 600 }}>
            Name
          </Typography>
          <TextField
            value={nodeName}
            onChange={handleNodeNameChange}
            onKeyDown={handleKeyDown}
            fullWidth
            size="small"
            placeholder="Enter node name"
          />
        </Box>

        {tokenTypes.length > 0 && (
          <Box>
            <Typography variant="smallCaps" sx={{ fontWeight: 600 }}>
              Initial Token Counts
            </Typography>
            <Stack spacing={1}>
              {tokenTypes.map((tokenType) => (
                <Box
                  key={tokenType.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        backgroundColor: tokenType.color,
                      }}
                    />
                    <Typography variant="smallTextLabels">
                      {tokenType.name}
                    </Typography>
                  </Box>
                  <TextField
                    type="number"
                    value={initialTokenCounts?.[tokenType.id] ?? 0}
                    onChange={(event) =>
                      handleTokenCountChange(tokenType.id, event.target.value)
                    }
                    size="small"
                    sx={{ width: 80 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose} size="small">
            Close
          </Button>
        </Box>
      </Stack>
    </Card>
  );
};
