import { useEffect, useState, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { Checkbox } from "../../forms/Checkbox";
import { TextInput } from "../../forms/TextInput";

export const TextInputOrDisplay: VoidFunctionComponent<{
  className?: string;
  clearOnUpdate?: boolean;
  placeholder?: string;
  readonly: boolean;
  updateText: (value: string) => void;
  value: string;
}> = ({
  className,
  clearOnUpdate,
  placeholder,
  readonly,
  updateText,
  value,
}) => {
  const [draftText, setDraftText] = useState(value);

  useEffect(() => {
    setDraftText(value);
  }, [value]);

  if (readonly) {
    return <span>{value}</span>;
  }

  return (
    <TextInput
      className={tw`${className}`}
      onBlur={() => {
        updateText(draftText);
        if (clearOnUpdate) {
          setDraftText("");
        }
      }}
      onChangeText={setDraftText}
      placeholder={placeholder}
      value={draftText}
    />
  );
};

export const ToggleInputOrDisplay: VoidFunctionComponent<{
  checked: boolean;
  onChange: (value: boolean) => void;
  readonly: boolean;
}> = ({ checked, onChange, readonly }) => {
  if (readonly) {
    return <span>{checked ? "Yes" : "No"}</span>;
  }
  return <Checkbox checked={checked} onChangeChecked={onChange} />;
};
