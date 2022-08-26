import { TextareaAutosize } from "@mui/material";
import {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useEffect,
  useState,
  FunctionComponent,
} from "react";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { rewriteEntityIdentifier } from "../../../lib/entities";
import { usePageContext } from "../PageContext";
import { cleanUpTitle, focusEditorBeginning, isValidPageTitle } from "./utils";

type PageTitleProps = {
  accountId: string;
  entityId: string;
  value: string;
};

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
  const { editorView } = usePageContext();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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

    if (!isValidPageTitle(valueToSave)) {
      setInputValue(value);
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
    <TextareaAutosize
      id="hash-page-title"
      placeholder="Untitled"
      disabled={updateEntityLoading}
      onChange={handleInputChange}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      style={{
        width: "100%",
        outline: "none",
        border: "none",
        resize: "none",
        fontFamily: "Open Sauce Two",
        fontSize: "var(--step-4)",
        fontWeight: 500,
        lineHeight: 1.23,
        opacity: updateEntityLoading ? 0.5 : undefined,
      }}
      value={inputValue}
    />
  );
};
