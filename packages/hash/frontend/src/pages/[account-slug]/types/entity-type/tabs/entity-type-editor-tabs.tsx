import { Typography, Tab, Stack, Box, Tabs, TabsProps } from "@mui/material";
import { FunctionComponent } from "react";

export const NAVIGATION_TABS = [
  {
    id: "definition",
    label: "Definition",
    path: "",
  },
  {
    id: "entities",
    label: "Entities",
    path: "entities",
  },
  {
    id: "views",
    label: "Views",
    path: "",
  },
  {
    id: "dependents",
    label: "Dependents",
    path: "",
  },
  {
    id: "activity",
    label: "Activity",
    path: "",
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

export type EntityTypeEditorTabsProps = {
  numberIndicators?: (number | undefined)[];
} & TabsProps;

export const EntityTypeEditorTabs: FunctionComponent<
  EntityTypeEditorTabsProps
> = ({ numberIndicators, onChange, value }) => (
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
