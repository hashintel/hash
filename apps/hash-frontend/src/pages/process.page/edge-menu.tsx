import { TextField } from "@hashintel/design-system";
import { Box, Card, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import type { TokenType } from "./token-editor";

interface EdgeMenuProps {
  edgeId: string;
  tokenWeights: {
    [tokenTypeId: string]: number;
  };
  position: { x: number; y: number };
  onClose: () => void;
  onUpdateWeights: (
    edgeId: string,
    tokenWeights: { [tokenTypeId: string]: number },
  ) => void;
  tokenTypes: TokenType[];
}

export const EdgeMenu = ({
  edgeId,
  tokenWeights,
  position,
  onClose: _onClose,
  onUpdateWeights,
  tokenTypes,
}: EdgeMenuProps) => {
  const [localWeights, setLocalWeights] = useState<{
    [tokenTypeId: string]: number;
  }>(tokenWeights);

  useEffect(() => {
    setLocalWeights(tokenWeights);
  }, [tokenWeights]);

  const handleWeightChange = (tokenTypeId: string, value: string) => {
    const parsedValue = parseInt(value, 10);
    const newWeight = Math.max(0, parsedValue || 0);

    const newWeights = {
      ...localWeights,
      [tokenTypeId]: newWeight,
    };
    setLocalWeights(newWeights);
    onUpdateWeights(edgeId, newWeights);
  };

  // Calculate total weight (excluding zero weights)
  const totalWeight = Object.values(localWeights).reduce(
    (sum, weight) => sum + (weight > 0 ? weight : 0),
    0,
  );

  return (
    <Card
      sx={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        p: 2,
        minWidth: 200,
      }}
    >
      <Stack spacing={2}>
        <Typography fontWeight="bold">Edge Requirements</Typography>
        <Stack spacing={1}>
          {tokenTypes.map((tokenType) => (
            <Box
              key={tokenType.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
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
                value={localWeights[tokenType.id] ?? 0}
                onChange={(event) =>
                  handleWeightChange(tokenType.id, event.target.value)
                }
                size="small"
                inputProps={{
                  min: 0,
                  style: { textAlign: "center", width: "60px" },
                }}
              />
            </Box>
          ))}
          <Box sx={{ display: "flex", justifyContent: "space-between", pt: 1 }}>
            <Typography fontWeight="bold">Total:</Typography>
            <Typography fontWeight="bold">{totalWeight}</Typography>
          </Box>
        </Stack>
      </Stack>
    </Card>
  );
};
