// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Picker from "@emoji-mart/react";
import { Popover } from "@hashintel/hash-design-system/popover";
import { BaseEmoji, PickerProps } from "emoji-mart";
import { bindPopover, PopupState } from "material-ui-popup-state/core";
import { FunctionComponent } from "react";

const TypedPicker = Picker as FunctionComponent<PickerProps>;

export type EmojiSelectHandler = (emoji: BaseEmoji) => void;

interface EmojiPickerProps {
  onEmojiSelect: EmojiSelectHandler;
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
        // @todo patch onEmojiSelect callback into @types/emoji-mart package
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        onEmojiSelect={(emoji: BaseEmoji) => {
          popupState.close();
          onEmojiSelect(emoji);
        }}
      />
    </Popover>
  );
};
