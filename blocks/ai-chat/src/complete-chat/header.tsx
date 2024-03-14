import {
  BlockSettingsButton,
  GetHelpLink,
} from "@hashintel/block-design-system";
import {
  Box,
  Collapse,
  Fade,
  inputBaseClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useState } from "react";

import type { ChatModelId } from "./chat-model-selector";
import { ChatModelSelector } from "./chat-model-selector";
import type { SystemPromptId } from "./system-prompt-selector";
import { SystemPromptSelector } from "./system-prompt-selector";

export const Header: FunctionComponent<{
  readonly: boolean;
  isMobile: boolean;
  disabled: boolean;
  hovered: boolean;
  inputFocused: boolean;
  chatModel: ChatModelId;
  setChatModel: (chatModel: ChatModelId) => void;
  systemPromptId: SystemPromptId;
  setSystemPromptId: (systemPromptId: SystemPromptId) => void;
}> = ({
  readonly,
  isMobile,
  disabled,
  hovered,
  inputFocused,
  chatModel,
  setChatModel,
  systemPromptId,
  setSystemPromptId,
}) => {
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  const [chatModelSelectorOpen, setChatModelSelectorOpen] = useState(false);
  const [systemPromptSelectorOpen, setSystemPromptSelectorOpen] =
    useState(false);

  return readonly ? null : (
    <Fade in={hovered || inputFocused || (isMobile && mobileSettingsExpanded)}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          mb: 1.5,
          columnGap: 3,
          rowGap: 1,
        }}
      >
        <GetHelpLink
          sx={{ fontWeight: 500 }}
          href="https://blockprotocol.org/@hash/blocks/ai-chat"
        />

        {isMobile ? (
          <BlockSettingsButton
            expanded={mobileSettingsExpanded}
            onClick={() => setMobileSettingsExpanded(!mobileSettingsExpanded)}
          />
        ) : null}

        <Collapse in={!isMobile || mobileSettingsExpanded}>
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
              flexWrap: "wrap",
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
                  transition: (theme) =>
                    theme.transitions.create("padding-right"),
                  paddingRight: disabled ? 0 : undefined,
                },
              }}
            />
          </Typography>
        </Collapse>
      </Box>
    </Fade>
  );
};
