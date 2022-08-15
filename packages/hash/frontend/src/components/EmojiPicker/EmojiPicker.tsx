import Picker from "@emoji-mart/react";
import { Popover } from "@hashintel/hash-design-system";
import { BaseEmoji } from "emoji-mart";
import { bindPopover, PopupState } from "material-ui-popup-state/core";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: BaseEmoji) => void;
  popupState: PopupState;
}

export const EmojiPicker = ({
  onEmojiSelect,
  popupState,
}: EmojiPickerProps) => {
  return (
    <Popover
      {...bindPopover(popupState)}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "center",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "center",
      }}
      elevation={4}
      sx={{ mt: 1 }}
    >
      <Picker
        autoFocus
        theme="light"
        onEmojiSelect={(emoji) => {
          popupState.close();
          /**
           * We cast `EmojiData` to `BaseEmoji` here, because we don't support `CustomEmoji` yet.
           * So we can safely say `emoji` is `BaseEmoji` for now
           */
          onEmojiSelect(emoji as BaseEmoji);
        }}
      />
    </Popover>
  );
};
