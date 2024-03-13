import Picker from "@emoji-mart/react";
import type { PopoverProps } from "@mui/material";
import { Popover } from "@mui/material";
import type { BaseEmoji } from "emoji-mart";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindPopover } from "material-ui-popup-state/hooks";

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
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
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
