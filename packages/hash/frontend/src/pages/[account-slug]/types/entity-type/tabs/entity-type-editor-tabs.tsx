import { Typography, Tab, Stack, Box, Tabs, TabsProps } from "@mui/material";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "../form-types";
import { useEntityTypeEntities } from "../use-entity-type-entities";

export const NAVIGATION_TABS = [
  {
    id: "definition",
    label: "Definition",
    path: "#",
  },
  {
    id: "entities",
    label: "Entities",
    path: "entities",
  },
  {
    id: "views",
    label: "Views",
    path: "views",
  },
  {
    id: "dependents",
    label: "Dependents",
    path: "dependents",
  },
  {
    id: "activity",
    label: "Activity",
    path: "activity",
  },
];

export type EntityTypeEditorTabProps = {
  id: string;
  label: string;
  active?: boolean;
  numberIndicator?: number;
};

export const EntityTypeEditorTab: FunctionComponent<
  EntityTypeEditorTabProps
> = ({ id, label, active, numberIndicator, ...props }) => (
  <Tab
    label={
      <Stack direction="row">
        <Typography
          variant="smallTextLabels"
          fontWeight={500}
          sx={{
            paddingY: 0.25,
          }}
        >
          {label}
        </Typography>

        {numberIndicator ? (
          <Box
            sx={({ palette }) => ({
              marginLeft: 1,
              paddingX: 1,
              paddingY: 0.25,
              borderRadius: "50%",
              background: active ? palette.blue[20] : palette.gray[20],
            })}
          >
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                fontWeight: 500,
                color: active ? palette.primary.main : palette.gray[80],
              })}
            >
              {numberIndicator}
            </Typography>
          </Box>
        ) : null}
      </Stack>
    }
    id={id}
    sx={{
      marginRight: 3,
      paddingY: "11px",
      paddingX: 0.5,
      minWidth: 0,
      minHeight: 0,
    }}
    {...props}
  />
);

export const EntityTypeEditorTabs: FunctionComponent<TabsProps> = ({
  onChange,
  value,
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const properties = useWatch({ control, name: "properties" });

  const { entities } = useEntityTypeEntities() ?? {};

  const numberIndicators = [properties.length, entities?.length];

  return (
    <Tabs
      value={value}
      onChange={onChange}
      TabIndicatorProps={{
        sx: ({ palette }) => ({
          height: 3,
          backgroundColor: palette.blue[60],
          minHeight: 0,
        }),
      }}
    >
      {NAVIGATION_TABS.map(({ id, label }, index) => (
        <EntityTypeEditorTab
          key={id}
          id={id}
          label={label}
          numberIndicator={numberIndicators?.[index]}
          active={value === index}
        />
      ))}
    </Tabs>
  );
};
