import { styled, TextareaAutosize, experimental_sx as sx } from "@mui/material";
import {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useState,
  FunctionComponent,
  useRef,
} from "react";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { rewriteEntityIdentifier } from "../../../lib/entities";
import { usePageContext } from "../PageContext";
import { cleanUpTitle, focusEditorBeginning } from "./utils";

const StyledTextarea = styled(TextareaAutosize)(({ theme }) =>
  sx({
    width: "100%",
    outline: "none",
    border: "none",
    resize: "none",
    fontFamily: "Open Sauce Two",
    fontSize: "var(--step-4)",
    fontWeight: 500,
    lineHeight: 1.23,

    "&::placeholder": {
      color: theme.palette.gray[40],
      opacity: 1,
    },

    ":disabled": {
      opacity: 0.5,
    },
  }),
);

type PageTitleProps = {
  accountId: string;
  entityId: string;
  value: string;
};

export const PAGE_TITLE_PLACEHOLDER = "Untitled";

// TODO: Add read-only mode based on page permissions
export const PageTitle: FunctionComponent<PageTitleProps> = ({
  accountId,
  entityId,
  value,
}) => {
  // TODO: Display update error once expected UX is discussed
  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(true);
  const [inputValue, setInputValue] = useState<string>(value);
  const prevValueRef = useRef(value);

  const { editorView, pageTitleRef } = usePageContext();

  const handleInputChange: ChangeEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    setInputValue(event.currentTarget.value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    const { currentTarget, key } = event;
    if (key === "Enter" || key === "Escape") {
      currentTarget.blur();
    }

    if (key === "ArrowDown") {
      const isCaret =
        currentTarget.selectionStart === currentTarget.selectionEnd;
      const isAtEnd = currentTarget.selectionEnd === inputValue.length;

      if (isCaret && isAtEnd) {
        focusEditorBeginning(editorView);
      }
    }
  };

  const handleInputBlur: FocusEventHandler<HTMLTextAreaElement> = () => {
    const valueToSave = cleanUpTitle(inputValue);
    if (valueToSave === value) {
      return;
    }

    void updateEntity({
      data: {
        entityId: rewriteEntityIdentifier({ accountId, entityId }),
        properties: { title: valueToSave },
      },
    });
  };

  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    setInputValue(value);
  }

  // TODO: Assign appropriate a11y attributes
  return (
    <StyledTextarea
      ref={pageTitleRef}
      placeholder={PAGE_TITLE_PLACEHOLDER}
      disabled={updateEntityLoading}
      onChange={handleInputChange}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      value={inputValue}
    />
  );
};
