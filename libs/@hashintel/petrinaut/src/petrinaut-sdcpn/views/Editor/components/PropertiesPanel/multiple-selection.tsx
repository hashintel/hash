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
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        Multiple Items Selected ({count})
      </div>
    </div>
  );
};
