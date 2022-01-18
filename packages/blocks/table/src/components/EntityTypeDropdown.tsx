import * as React from "react";
import { tw } from "twind";
import { BlockProtocolEntityType } from "blockprotocol";

type EntityTypeDropdownProps = {
  onChange?: (entityTypeId?: string) => void;
  value?: string;
  options: BlockProtocolEntityType[];
};

export const EntityTypeDropdown: React.VoidFunctionComponent<
  EntityTypeDropdownProps
> = ({ onChange, value, options }) => {
  return (
    <select
      onChange={(event) => onChange?.(event.target.value)}
      value={value}
      className={tw`block w-40 border-1 rounded px-3 py-1.5 text-sm focus:outline-none hover:border-blue-300 focus:border-blue-500`}
    >
      <option key="" value="">
        None
      </option>
      {options.map(({ entityTypeId, title }) => (
        <option key={entityTypeId} value={entityTypeId}>
          {title}
        </option>
      ))}
    </select>
  );
};
