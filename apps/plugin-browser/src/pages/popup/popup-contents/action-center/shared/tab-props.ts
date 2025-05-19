export const generateTabA11yProps = (
  label: "One-off" | "Automated" | "History",
) => ({
  id: `tab-${label}`,
  "aria-controls": `tabpanel-${label}`,
});

export const generateTabPanelA11yProps = (
  label: "One-off" | "Automated" | "History",
) => ({
  id: `tabpanel-${label}`,
  "aria-labelledby": `tab-${label}`,
  role: "tabpanel",
});

export type TabPanelProps = {
  children?: React.ReactNode;
  dir?: string;
  index: number;
  value: number;
};
