import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { CardData } from "../types";
import styles from "./styles.module.scss";

export const StaticCard = ({
  data,
  shadow,
}: {
  data: CardData;
  shadow?: boolean;
}) => {
  return (
    <div
      className={styles.wrapper}
      style={shadow ? { boxShadow: "var(--shadow-3)" } : {}}
    >
      {data.content}
      <IconButton>
        <DiscardIcon />
      </IconButton>
    </div>
  );
};
