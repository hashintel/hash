import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { CardData } from "../types";
import styles from "./styles.module.scss";

export const Card = ({
  data,
  onDelete,
}: {
  data: CardData;
  onDelete: () => void;
}) => {
  return (
    <div className={styles.wrapper}>
      {data.content}
      <IconButton onClick={onDelete}>
        <DiscardIcon />
      </IconButton>
    </div>
  );
};
