import { GetHelpLink } from "@hashintel/design-system";
import {
  Box,
  inputBaseClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import { FunctionComponent, useState } from "react";

import { ChatModelId, ChatModelSelector } from "./chat-model-selector";
import { SystemPromptId, SystemPromptSelector } from "./system-prompt-selector";

export const Header: FunctionComponent<{
  disabled: boolean;
  chatModel: ChatModelId;
  setChatModel: (chatModel: ChatModelId) => void;
  systemPromptId: SystemPromptId;
  setSystemPromptId: (systemPromptId: SystemPromptId) => void;
}> = ({
  disabled,
  chatModel,
  setChatModel,
  systemPromptId,
  setSystemPromptId,
}) => {
  const [chatModelSelectorOpen, setChatModelSelectorOpen] = useState(false);
  const [systemPromptSelectorOpen, setSystemPromptSelectorOpen] =
    useState(false);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        mb: 1.5,
      }}
    >
      <GetHelpLink
        sx={{ fontWeight: 500 }}
        href="https://blockprotocol.org/@hash/blocks/ai-chat"
      />

      <Typography
        variant="regularTextLabels"
        sx={{
          display: "inline-flex",
          gap: 1,
          alignItems: "center",
          fontWeight: 500,
          fontSize: 15,
          lineHeight: 1,
          letterSpacing: -0.02,
          color: ({ palette }) => palette.gray[50],
        }}
      >
        Using
        <ChatModelSelector
          open={chatModelSelectorOpen}
          disabled={disabled}
          onOpen={() => setChatModelSelectorOpen(true)}
          onClose={() => setChatModelSelectorOpen(false)}
          value={chatModel}
          onChange={setChatModel}
          sx={{
            [`& .${selectClasses.icon}`]: {
              right: 0,
            },
            [`& .${selectClasses.select}.${selectClasses.outlined}.${inputBaseClasses.input}`]:
              {
                paddingLeft: 0,
                transition: (theme) =>
                  theme.transitions.create("padding-right"),
                paddingRight: disabled ? 0 : 2,
              },
          }}
        />
        in
        <SystemPromptSelector
          open={systemPromptSelectorOpen}
          disabled={disabled}
          onOpen={() => setSystemPromptSelectorOpen(true)}
          onClose={() => setSystemPromptSelectorOpen(false)}
          value={systemPromptId}
          onChange={setSystemPromptId}
          sx={{
            [`& .${selectClasses.select}`]: {
              paddingLeft: 0,
              transition: (theme) => theme.transitions.create("padding-right"),
              paddingRight: disabled ? 0 : undefined,
            },
          }}
        />
      </Typography>
    </Box>
  );
};
