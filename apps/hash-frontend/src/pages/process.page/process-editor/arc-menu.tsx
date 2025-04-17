import { TextField } from "@hashintel/design-system";
import { Box, Card, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "reactflow";

import type { TokenType } from "./token-type-editor";

interface ArcMenuProps {
  arcId: string;
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
  position: { x: number; y: number };
  onClose: () => void;
  onUpdateWeights: (
    arcId: string,
    tokenWeights: { [tokenTypeId: string]: number | undefined },
  ) => void;
  tokenTypes: TokenType[];
}

export const ArcMenu = ({
  arcId,
  tokenWeights,
  position,
  onClose: _onClose,
  onUpdateWeights,
  tokenTypes,
}: ArcMenuProps) => {
  const [localWeights, setLocalWeights] = useState<{
    [tokenTypeId: string]: number | undefined;
  }>(tokenWeights);

  const { getNodes, getEdges } = useReactFlow();

  const direction = useMemo(() => {
    const arc = getEdges().find((edge) => edge.id === arcId);

    const targetNode = getNodes().find((node) => node.id === arc?.target);

    if (!targetNode) {
      return "in";
    }

    return targetNode.type === "transition" ? "in" : "out";
  }, [arcId, getEdges, getNodes]);

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
    onUpdateWeights(arcId, newWeights);
  };

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
        <Typography fontWeight="bold">
          {direction === "in" ? "Tokens Required" : "Tokens Produced"}
        </Typography>
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
        </Stack>
      </Stack>
    </Card>
  );
};
