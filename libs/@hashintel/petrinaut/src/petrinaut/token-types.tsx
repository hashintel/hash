import { Box, Button, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { useEditorContext } from "./editor-context";
import { TokenTypeEditor } from "./token-types/token-type-editor";

export { defaultTokenTypes } from "./token-types/token-type-editor";

export const TokenTypes = () => {
  const [tokenTypeEditorOpen, setTokenTypeEditorOpen] = useState(false);

  const { petriNetDefinition } = useEditorContext();

  return (
    <>
      <TokenTypeEditor
        open={tokenTypeEditorOpen}
        onClose={() => setTokenTypeEditorOpen(false)}
      />
      <Stack
        alignItems="center"
        direction="row"
        gap={2}
        sx={{
          p: 1,
          borderRadius: 1,
          bgcolor: "background.paper",
          boxShadow: 1,
        }}
      >
        {petriNetDefinition.tokenTypes.map((token) => (
          <Stack
            key={token.id}
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              cursor: "pointer",
              borderRadius: 1,
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                bgcolor: token.color,
                border: "1px solid",
                borderColor: "divider",
              }}
            />
            <Typography sx={{ fontSize: "0.875rem" }}>{token.name}</Typography>
          </Stack>
        ))}

        <Button size="xs" onClick={() => setTokenTypeEditorOpen(true)}>
          Edit Types
        </Button>
      </Stack>
    </>
  );
};
