import { CardData } from "../types";
import styles from "./styles.module.scss";

export const Card = ({ data }: { data: CardData }) => {
  return <div className={styles.wrapper}>{data.content}</div>;
};
