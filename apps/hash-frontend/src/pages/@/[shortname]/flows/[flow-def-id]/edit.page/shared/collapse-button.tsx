import { Button } from "@hashintel/ds-components";

export const CollapseButton = ({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => (
  <Button
    variant="ghost"
    size="xxs"
    iconName={collapsed ? "chevronRight" : "chevronDown"}
    aria-label={collapsed ? "Expand" : "Collapse"}
    aria-expanded={!collapsed}
    onClick={onToggle}
  />
);
