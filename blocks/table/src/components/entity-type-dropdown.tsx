import { EntityType } from "@blockprotocol/graph";
import { FunctionComponent } from "react";
import { tw } from "twind";

type EntityTypeDropdownProps = {
  onChange?: (entityTypeId?: string) => void;
  value?: string;
  options: EntityType[];
};

export const EntityTypeDropdown: FunctionComponent<EntityTypeDropdownProps> = ({
  onChange,
  value,
  options,
}) => {
  return (
    <select
      onChange={(event) => onChange?.(event.target.value)}
      value={value}
      className={tw`border-gray-300 block w-40 border-1 rounded px-3 py-1.5 text-sm focus:outline-none hover:border-blue-300 focus:border-blue-500`}
    >
      <option key="" value="">
        None
      </option>
      {options.map(({ entityTypeId, schema }) => (
        <option key={entityTypeId} value={entityTypeId}>
          {schema.title}
        </option>
      ))}
    </select>
  );
};
