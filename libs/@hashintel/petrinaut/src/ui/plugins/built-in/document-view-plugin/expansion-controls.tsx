import { Button } from "@hashintel/ds-components";

/** Opens or closes every row of the outline at once. */
export const ExpansionControls = ({
  onExpandAll,
  onCollapseAll,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) => (
  <>
    <Button
      size="xxs"
      variant="ghost"
      iconName="expand"
      aria-label="Expand all"
      tooltip="Expand all"
      onClick={onExpandAll}
    />
    <Button
      size="xxs"
      variant="ghost"
      iconName="collapse"
      aria-label="Collapse all"
      tooltip="Collapse all"
      onClick={onCollapseAll}
    />
  </>
);
