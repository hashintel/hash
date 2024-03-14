import type { Rectangle } from "@glideapps/glide-data-grid";
import { useLayer } from "react-laag";
import { useKey } from "rooks";

import { DangerButton } from "../shared/danger-button";
import styles from "./styles.module.scss";

interface HeaderMenuProps {
  title: string;
  updateTitle: (title: string) => void;
  bounds: Rectangle;
  onOutsideClick: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const HeaderMenu = ({
  title,
  updateTitle,
  onDelete,
  onClose,
  onOutsideClick,
  bounds,
}: HeaderMenuProps) => {
  useKey(["Escape", "Enter"], onClose);

  const { layerProps, renderLayer } = useLayer({
    isOpen: true,
    auto: true,
    placement: "bottom-end",
    triggerOffset: 2,
    onOutsideClick,
    trigger: {
      getBounds: () => ({
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        right: bounds.x + bounds.width,
        bottom: bounds.y + bounds.height,
      }),
    },
  });

  return renderLayer(
    <div className={styles.wrapper} {...layerProps}>
      <input
        autoFocus
        defaultValue={title}
        onChange={(event) => updateTitle(event.target.value)}
      />
      <DangerButton
        onClick={onDelete}
        sx={{
          padding: ({ spacing }) => spacing(0.75, 1),
        }}
      >
        Delete
      </DangerButton>
    </div>,
  );
};
