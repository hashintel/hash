import { useRef, useState } from "react";

import { TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const renameInput = css({ fontWeight: "medium", minWidth: "0" });

/**
 * A name edited in place: it reads as text with a pen icon, and is typed into when clicked. Escape, or leaving it
 * blank or unchanged, keeps the name it had when editing began, which a reload after a conflict may have changed
 * meanwhile. Auto-focused, as for something just added, it starts with the name selected, to be typed over.
 */
export const RenameInput = ({
  value,
  placeholder,
  autoFocus = false,
  ariaLabel,
  onRename,
}: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel: string;
  onRename: (name: string) => void;
}) => {
  const [editing, setEditing] = useState<{
    from: string;
    typed: string;
  } | null>(null);
  const cancelledRef = useRef(false);
  const selectOnFocusRef = useRef(autoFocus);

  return (
    <TextInput
      variant="subtle"
      size="sm"
      width="fitContent"
      showEditIcon
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={renameInput}
      value={editing?.typed ?? value}
      onFocus={(event) => {
        setEditing({ from: value, typed: value });

        if (selectOnFocusRef.current) {
          selectOnFocusRef.current = false;
          event.target.select();
        }
      }}
      onChange={(typed) =>
        setEditing((current) => current && { ...current, typed })
      }
      onKeyDown={(event) => {
        if (
          (event.key !== "Enter" && event.key !== "Escape") ||
          event.nativeEvent.isComposing
        ) {
          return;
        }

        cancelledRef.current = event.key === "Escape";

        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const renamed = editing?.typed.trim();

        if (!cancelledRef.current && renamed && renamed !== editing?.from) {
          onRename(renamed);
        }

        cancelledRef.current = false;
        setEditing(null);
      }}
    />
  );
};
