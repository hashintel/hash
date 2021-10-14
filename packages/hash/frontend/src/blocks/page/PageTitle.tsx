import React, {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { tw } from "twind";
import { useBlockProtocolUpdate } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";

type PageTitleProps = {
  value: string;
  accountId: string;
  metadataId: string;
};

// TODO: Improve page title validation and use it when creating pages.
// Alternatively, we can validate on server-side only and handle mutation errors.
const isValidPageTitle = (value: string): boolean => Boolean(value.length);
const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

// TODO: Add read-only mode based on page permissions
export const PageTitle: VoidFunctionComponent<PageTitleProps> = ({
  value,
  metadataId,
  accountId,
}) => {
  // TODO: Display update error once expected UX is discussed
  const { update, updateLoading /* updateError */ } = useBlockProtocolUpdate();
  const [inputValue, setInputValue] = useState<string>(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setInputValue(event.currentTarget.value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (
    event
  ) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  const handleInputBlur: FocusEventHandler<HTMLInputElement> = () => {
    const valueToSave = cleanUpTitle(inputValue);
    if (valueToSave === value) {
      return;
    }

    if (!isValidPageTitle(valueToSave)) {
      setInputValue(value);
      return;
    }

    void update([
      {
        entityId: metadataId,
        entityTypeId: "Page",
        accountId,
        data: { title: valueToSave },
      },
    ]);
  };

  // TODO: Assign appropriate a11y attributes
  return (
    <input
      disabled={updateLoading}
      onChange={handleInputChange}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      className={tw`font-medium text-2xl w-full py-0.5 -mx-1 px-1 mt-px ${
        updateLoading ? "opacity-50" : undefined
      }`}
      value={inputValue}
    />
  );
};
