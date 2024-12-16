import type { Emoji, Skin } from "@emoji-mart/data";
import type { PopoverProps } from "@mui/material";
import { Popover } from "@mui/material";
import { Picker } from "emoji-mart";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindPopover } from "material-ui-popup-state/hooks";
import { type FC, useEffect, useRef } from "react";

export type EmojiPickerPopoverProps = Omit<
  PopoverProps,
  | keyof ReturnType<typeof bindPopover>
  | "anchorOrigin"
  | "transformOrigin"
  | "elevation"
  | "sx"
>;

// see: https://github.com/missive/emoji-mart/issues/576#issuecomment-1678195620
type ExtractProps<T> = {
  [K in keyof T]?: T[K] extends { value: infer V } ? V : never;
};

// vendored from https://github.com/missive/emoji-mart/blob/16978d04a766eec6455e2e8bb21cd8dc0b3c7436/packages/emoji-mart-react/react.tsx
const EmojiPickerWrapper: FC<
  ExtractProps<typeof Picker.Props> & {
    onEmojiSelect: (emoji: Emoji & Skin) => void;
  }
> = (props: ExtractProps<typeof Picker.Props>) => {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<Picker | null>(null);

  if (instance.current) {
    instance.current.update(props);
  }

  useEffect(() => {
    instance.current = new Picker({ ...props, ref });

    return () => {
      instance.current = null;
    };
  }, [props]);

  return <div ref={ref} />;
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: Emoji & Skin) => void;
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
      <EmojiPickerWrapper
        autoFocus
        theme="light"
        onEmojiSelect={(emoji) => {
          popupState.close();
          /**
           * We cast `EmojiData` to `BaseEmoji` here, because we don't support `CustomEmoji` yet.
           * So we can safely say `emoji` is `BaseEmoji` for now
           */
          onEmojiSelect(emoji);
        }}
      />
    </Popover>
  );
};
