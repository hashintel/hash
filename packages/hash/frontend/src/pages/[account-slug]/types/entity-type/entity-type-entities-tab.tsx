import { TabProps } from "@mui/material";
import { FunctionComponent } from "react";
import { useEntityTypeEntities } from "./use-entity-type-entities";
import { TabButton } from "./tab-button";

export const EntityTypeEntitiesTab: FunctionComponent<TabProps> = ({
  value,
  ...props
}) => {
  const { entities } = useEntityTypeEntities() ?? {};

  return (
    <TabButton
      {...props}
      value={value}
      label="Entities"
      count={entities?.length}
    />
  );
};
