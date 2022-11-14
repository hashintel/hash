import { TabProps } from "@mui/material";
import { FunctionComponent } from "react";
import { useEntityTypeEntities } from "./use-entity-type-entities";
import { TabLink } from "./tab-link";

export const EntityTypeEntitiesTab: FunctionComponent<TabProps> = ({
  value,
  ...props
}) => {
  const { entities } = useEntityTypeEntities() ?? {};

  return (
    <TabLink
      {...props}
      value={value}
      label="Entities"
      count={entities?.length}
    />
  );
};
