import { useEffect, useState, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { Checkbox } from "../../forms/Checkbox";
import { TextInput } from "../../forms/TextInput";

export const TextInputOrDisplay: VoidFunctionComponent<{
  className?: string;
  clearOnUpdate?: boolean;
  placeholder?: string;
  readonly: boolean;
  required?: boolean;
  updateOnBlur?: boolean;
  updateText: (value: string) => void;
  value: string;
}> = ({
  className,
  clearOnUpdate,
  placeholder,
  readonly,
  required,
  updateOnBlur,
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

  let textChangeEvents: {
    onBlur?: () => void;
    onChangeText: (value: string) => void;
  } = {
    onChangeText: updateText,
  };

  if (updateOnBlur) {
    textChangeEvents = {
      onBlur: () => {
        updateText(draftText);
        if (clearOnUpdate) {
          setDraftText("");
        }
      },
      onChangeText: setDraftText,
    };
  }

  return (
    <TextInput
      className={tw`${className}`}
      placeholder={placeholder}
      value={draftText}
      required={required}
      {...textChangeEvents}
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
