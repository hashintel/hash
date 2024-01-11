import { DangerButton } from "../shared/danger-button";
import styles from "./table.module.scss";

export const RowActions = ({
  selectedRowCount,
  onDelete,
}: {
  onDelete: () => void;
  selectedRowCount: number;
}) => {
  return (
    <div className={styles.rowActions}>
      <div>{`${selectedRowCount} ${
        selectedRowCount > 1 ? "rows" : "row"
      } selected`}</div>
      <DangerButton
        onClick={onDelete}
        sx={{
          padding: ({ spacing }) => spacing(0, 1),
          height: "100%",
          alignItems: "center",
        }}
      >
        Delete
      </DangerButton>
    </div>
  );
};
