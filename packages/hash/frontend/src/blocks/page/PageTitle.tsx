import React, {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { tw } from "twind";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";

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
export const PageTitle: VoidFunctionComponent<PageTitleProps> = ({
  accountId,
  entityId,
  value,
}) => {
  // TODO: Display update error once expected UX is discussed
  const { updateEntity, updateEntityLoading } = useBlockProtocolUpdateEntity();
  const [inputValue, setInputValue] = useState<string>(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setInputValue(event.currentTarget.value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (
    event,
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

    void updateEntity({
      data: {
        entityId: JSON.stringify({ accountId, entityId, entityTypeId: "Page" }),
        properties: { title: valueToSave },
      },
    });
  };

  // TODO: Assign appropriate a11y attributes
  return (
    <input
      placeholder="A title for the page"
      disabled={updateEntityLoading}
      onChange={handleInputChange}
      onKeyDown={handleInputKeyDown}
      onBlur={handleInputBlur}
      className={tw`border-none font-medium text-2xl w-full py-0.5 -mx-1 px-1 mt-px ${
        updateEntityLoading ? "opacity-50" : undefined
      }`}
      value={inputValue}
    />
  );
};
