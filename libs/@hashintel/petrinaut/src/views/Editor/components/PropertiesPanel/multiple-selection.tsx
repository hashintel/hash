import { css } from "@hashintel/ds-helpers/css";

const titleStyle = css({
  fontWeight: 600,
  fontSize: "[14px]",
});

/**
 * MultipleSelection - Displays info when multiple items are selected
 */
interface MultipleSelectionProps {
  count: number;
}

export const MultipleSelection: React.FC<MultipleSelectionProps> = ({
  count,
}) => {
  return (
    <div>
      <div className={titleStyle}>Multiple Items Selected ({count})</div>
    </div>
  );
};
