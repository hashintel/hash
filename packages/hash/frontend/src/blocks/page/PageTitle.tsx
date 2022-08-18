import { Typography } from "@mui/material";
import {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useRef,
  FunctionComponent,
} from "react";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { rewriteEntityIdentifier } from "../../lib/entities";

type PageTitleProps = {
  accountId: string;
  entityId: string;
  value: string;
};

// TODO: Improve page title validation and use it when creating pages.
// Alternatively, we can validate on server-side only and handle mutation errors.
const isValidPageTitle = (value: string): boolean => Boolean(value.length);
const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

// TODO: Add read-only mode based on page permissions
export const PageTitle: FunctionComponent<PageTitleProps> = ({
  accountId,
  entityId,
  value,
}) => {
  // TODO: Display update error once expected UX is discussed
  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(true);

  const titleValueRef = useRef(value);

  const handleInputChange: ChangeEventHandler<HTMLHeadingElement> = (event) => {
    const { currentTarget } = event;
    titleValueRef.current = currentTarget.textContent || "";

    /**
     * this prevents two issues
     * 1 - when user pastes styled stuff into title
     * other way of achieving this is implementing https://htmldom.dev/paste-as-plain-text/
     * this looks like working well for now on all browser.
     * we can switch to paste-as-plain-text later if we decide this solution is not enough
     * 2 - firefox & safari renders a `br` tag when user clears the editable area,
     * which prevents css selector `:empty` from working. This removes the `br` as well
     */
    if (currentTarget?.children.length) {
      currentTarget.innerText = currentTarget.textContent || "";
    }
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (
    event,
  ) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.currentTarget.blur();
    }

    if (event.key === "ArrowDown") {
      const { anchorOffset, type } = window.getSelection() || {};

      const isCaret = type === "Caret";
      const isCaretAtEnd = anchorOffset === titleValueRef?.current.length;

      if (isCaret && isCaretAtEnd) {
        /** @todo focus to first block in the editor */
        alert("focus to first block");
      }
    }
  };

  const handleInputBlur: FocusEventHandler<HTMLInputElement> = () => {
    const valueToSave = cleanUpTitle(titleValueRef.current);
    if (valueToSave === value) {
      return;
    }

    if (!isValidPageTitle(valueToSave)) {
      titleValueRef.current = value;
      return;
    }

    void updateEntity({
      data: {
        entityId: rewriteEntityIdentifier({ accountId, entityId }),
        properties: { title: valueToSave },
      },
    });
  };

  // TODO: Assign appropriate a11y attributes
  return (
    <Typography
      id="hash-page-title"
      component="h1"
      variant="h2"
      contentEditable={!updateEntityLoading}
      suppressContentEditableWarning
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      onInput={handleInputChange}
      sx={{
        "*": {
          /**
           * this overrides `b` and `i` tag styles
           * even if user marks them via keyboard shortcuts
           */
          fontWeight: "inherit !important",
          fontStyle: "inherit !important",
        },
        width: "100%",
        outline: "none",
        opacity: updateEntityLoading ? 0.5 : undefined,
        ":empty:before": {
          content: "'Untitled'",
          opacity: 0.3,
        },
      }}
    >
      {value}
    </Typography>
  );
};
