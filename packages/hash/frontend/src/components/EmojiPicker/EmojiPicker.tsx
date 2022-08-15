import Picker from "@emoji-mart/react";
import { Popover } from "@hashintel/hash-design-system";
import { BaseEmoji, PickerProps } from "emoji-mart";
import { bindPopover, PopupState } from "material-ui-popup-state/core";
import { FunctionComponent } from "react";

const TypedPicker = Picker as FunctionComponent<PickerProps>;

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
      <TypedPicker
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
