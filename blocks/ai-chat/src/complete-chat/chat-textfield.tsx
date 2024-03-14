import { BlockPromptInput } from "@hashintel/block-design-system";
import type { FunctionComponent } from "react";
import { useCallback, useState } from "react";

import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";

export const ChatTextField: FunctionComponent<{
  loading: boolean;
  chatHasStarted: boolean;
  submitMessageContent: (messageContent: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}> = ({ submitMessageContent, chatHasStarted, loading, onFocus, onBlur }) => {
  const [inputValue, setInputValue] = useState<string>("");

  const handleSubmit = useCallback(() => {
    setInputValue("");
    submitMessageContent(inputValue);
  }, [inputValue, submitMessageContent]);

  return (
    <BlockPromptInput
      value={inputValue}
      onSubmit={handleSubmit}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={({ target }) => setInputValue(target.value)}
      placeholder={chatHasStarted ? "Enter a response" : "Begin a conversation"}
      disabled={loading}
      buttonLabel={
        <>
          Submit
          <ArrowTurnDownLeftIcon
            sx={{
              ml: 1,
              fontSize: 12,
            }}
          />
        </>
      }
    />
  );
};
