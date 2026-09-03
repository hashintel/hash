import { Button, Menu, type MenuItem } from "@hashintel/ds-components";

import { voiceSessionActionLabels } from "../../../../components/voice-session-labels";

import type { VoiceSessionActions } from "../../../../../../../react/voice-session/store";

export const VoicePlaybackMenu = ({
  actions,
  canReadFullResponse,
  canRepeatQuestion,
}: {
  actions: VoiceSessionActions;
  canReadFullResponse: boolean;
  canRepeatQuestion: boolean;
}) => {
  const items: MenuItem[] = [
    {
      disabled: !canRepeatQuestion || !actions.repeatQuestion,
      id: "repeat-question",
      onClick: () => actions.repeatQuestion?.(),
      text: voiceSessionActionLabels.repeatQuestion,
    },
    {
      disabled: !canReadFullResponse || !actions.readFullResponse,
      id: "read-full-response",
      onClick: () => actions.readFullResponse?.(),
      text: voiceSessionActionLabels.readFullResponse,
    },
  ];

  return (
    <Menu
      items={items}
      position="top-start"
      trigger={
        <Button
          aria-label={voiceSessionActionLabels.playbackOptions}
          iconName="ellipsis"
          size="sm"
          tooltip={voiceSessionActionLabels.playbackOptions}
          type="button"
          variant="ghost"
        />
      }
    />
  );
};
