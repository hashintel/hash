import type { BaseEmoji } from "emoji-mart";
import type { bindPopover, PopupState } from "material-ui-popup-state/hooks";
import Picker from "@emoji-mart/react";
import type { Popover, PopoverProps } from "@mui/material";

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
      elevation={4}
      sx={{ mt: 1 }}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
      }}
      {...(popoverProps ?? {})}
    >
      <Picker
        autoFocus
        theme={"light"}
        onEmojiSelect={(emoji) => {
          popupState.close();
          /**
           * We cast `EmojiData` to `BaseEmoji` here, because we don't support `CustomEmoji` yet.
           * So we can safely say `emoji` is `BaseEmoji` for now.
           */
          onEmojiSelect(emoji as BaseEmoji);
        }}
      />
    </Popover>
  );
};
