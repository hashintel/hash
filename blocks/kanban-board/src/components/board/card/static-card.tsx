import type { CardData } from "../types";
import { CardContent } from "./card-content/card-content";
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
      <CardContent content={data.content} readonly />
    </div>
  );
};
