import { TextField } from "@hashintel/design-system";
import { Box, Card, Stack, Typography } from "@mui/material";

import { Button } from "../../../shared/ui";
import type { TokenType } from "./token-type-editor";
import type { PlaceNodeType, TokenCounts } from "./types";

export type PlaceEditorProps = {
  selectedPlace: PlaceNodeType;
  position: { x: number; y: number };
  tokenTypes: TokenType[];
  onClose: () => void;
  onUpdateTokens: (nodeId: string, tokenCounts: TokenCounts) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
};

export const PlaceEditor = ({
  selectedPlace,
  position,
  tokenTypes,
  onClose,
  onUpdateTokens,
  onUpdateNodeLabel,
}: PlaceEditorProps) => {
  const { data, id: placeId } = selectedPlace;
  const { label: nodeName, tokenCounts } = data;

  const handleTokenCountChange = (tokenTypeId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const newCount = Number.isNaN(numValue) ? 0 : Math.max(0, numValue);

    const newTokenCounts = {
      ...tokenCounts,
      [tokenTypeId]: newCount,
    };

    onUpdateTokens(placeId, newTokenCounts);
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
        position: "absolute",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        width: 300,
        padding: 2,
        boxShadow: 3,
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography fontWeight="bold">Node Name</Typography>
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
            <Typography fontWeight="bold">Tokens</Typography>
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
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        backgroundColor: tokenType.color,
                      }}
                    />
                    <Typography>{tokenType.name}</Typography>
                  </Box>
                  <TextField
                    type="number"
                    value={tokenCounts[tokenType.id] ?? 0}
                    onChange={(event) =>
                      handleTokenCountChange(tokenType.id, event.target.value)
                    }
                    size="small"
                    inputProps={{
                      min: 0,
                      style: { textAlign: "center", width: "60px" },
                    }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Close</Button>
        </Box>
      </Stack>
    </Card>
  );
};
