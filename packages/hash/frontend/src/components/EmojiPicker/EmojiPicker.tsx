import Picker from "@emoji-mart/react";
import { Popover, PopoverProps } from "@mui/material";
import { BaseEmoji } from "emoji-mart";
import { bindPopover, PopupState } from "material-ui-popup-state/core";

export type EmojiPickerPopoverProps = Omit<
  PopoverProps,
  | keyof ReturnType<typeof bindPopover>
  | "anchorOrigin"
  | "transformOrigin"
  | "elevation"
  | "sx"
>;

interface EmojiPickerProps {
  onEmojiSelect: (emoji: BaseEmoji) => void;
  popupState: PopupState;
  popoverProps?: EmojiPickerPopoverProps;
}

export const EmojiPicker = ({
  onEmojiSelect,
  popupState,
  popoverProps,
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
      {...(popoverProps ?? {})}
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
