import { TabProps } from "@mui/material";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";
import { TabLink } from "./tab-link";

export const EntityTypeDefinitionTab: FunctionComponent<TabProps> = ({
  value,
  ...props
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const propertiesCount = useWatch({ control, name: "properties.length" });

  return (
    <TabLink
      {...props}
      value={value}
      label="Definition"
      count={propertiesCount}
    />
  );
};
