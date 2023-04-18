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
      <button type="button" onClick={onDelete} className={styles.danger}>
        Delete
      </button>
    </div>
  );
};
