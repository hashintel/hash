import { LayerProps } from "react-laag";
import { useKey } from "rooks";
import styles from "./styles.module.scss";

interface HeaderMenuProps {
  title: string;
  updateTitle: (title: string) => void;
  layerProps: LayerProps;
  onDelete: () => void;
  onClose: () => void;
}

export const HeaderMenu = ({
  layerProps,
  title,
  updateTitle,
  onDelete,
  onClose,
}: HeaderMenuProps) => {
  useKey(["Escape", "Enter"], onClose);

  return (
    <div className={styles.wrapper} {...layerProps}>
      <input
        autoFocus
        defaultValue={title}
        onChange={(event) => updateTitle(event.target.value)}
      />
      <div className={styles.danger} onClick={onDelete}>
        Delete
      </div>
    </div>
  );
};
