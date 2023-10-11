import { EntityId } from "@local/hash-subgraph";
import { styled, TextareaAutosize } from "@mui/material";
import {
  ChangeEventHandler,
  FocusEventHandler,
  FunctionComponent,
  KeyboardEventHandler,
  useEffect,
  useState,
} from "react";

import { useUpdatePageTitle } from "../../../../components/hooks/use-update-page-title";
import { usePageContext } from "../page-context";
import { cleanUpTitle, focusEditorBeginning } from "./utils";

export const PAGE_TITLE_FONT_SIZE = "var(--step-4)";
export const PAGE_TITLE_LINE_HEIGHT = 1.23;

const StyledTextarea = styled(TextareaAutosize)(({ theme }) =>
  theme.unstable_sx({
    width: "100%",
    outline: "none",
    border: "none",
    resize: "none",
    fontFamily: "Open Sauce Two",
    fontSize: PAGE_TITLE_FONT_SIZE,
    lineHeight: PAGE_TITLE_LINE_HEIGHT,
    fontWeight: 500,
    color: theme.palette.black,

    "&::placeholder": {
      color: theme.palette.gray[40],
      opacity: 1,
    },

    ":disabled": {
      opacity: 1,
      background: "transparent",
    },
  }),
);

type PageTitleProps = {
  pageEntityId: EntityId;
  value: string;
  readonly: boolean;
};

export const PAGE_TITLE_PLACEHOLDER = "Untitled";

export const PageTitle: FunctionComponent<PageTitleProps> = ({
  pageEntityId,
  value,
  readonly,
}) => {
  // TODO: Display update error once expected UX is discussed

  const [updatePageTitle, { updatePageTitleLoading }] = useUpdatePageTitle();

  const [prevValue, setPrevValue] = useState(value);
  const [inputValue, setInputValue] = useState(value);

  const { editorContext, pageTitleRef } = usePageContext();

  const handleInputChange: ChangeEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    setInputValue(event.currentTarget.value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    const { currentTarget, key, shiftKey } = event;
    if (key === "Escape") {
      currentTarget.blur();
    }

    if (key === "Enter" && !shiftKey) {
      event.preventDefault();
      void focusEditorBeginning(
        editorContext?.view,
        editorContext?.manager,
        true,
      );
    }

    if (key === "ArrowDown") {
      const isCaret =
        currentTarget.selectionStart === currentTarget.selectionEnd;
      const isAtEnd = currentTarget.selectionEnd === inputValue.length;

      if (isCaret && isAtEnd) {
        void focusEditorBeginning(editorContext?.view, editorContext?.manager);
      }
    }
  };

  const handleInputBlur: FocusEventHandler<HTMLTextAreaElement> = () => {
    const valueToSave = cleanUpTitle(inputValue);
    if (valueToSave === value) {
      return;
    }

    void updatePageTitle(valueToSave, pageEntityId);
  };

  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(value);
  }

  useEffect(() => {
    if (pageTitleRef.current && pageTitleRef.current.value === "") {
      pageTitleRef.current.focus();
    }
  }, [pageTitleRef]);

  // TODO: Assign appropriate a11y attributes
  return (
    <StyledTextarea
      ref={pageTitleRef}
      placeholder={PAGE_TITLE_PLACEHOLDER}
      disabled={updatePageTitleLoading || readonly}
      onChange={handleInputChange}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      value={inputValue}
    />
  );
};
