/* eslint-disable react/no-array-index-key -- guidance rows are static authored content */

import { Icon, type IconName } from "../../src/components/Icon/icon";
import { doDontListRecipe } from "./do-dont-list.recipe";

/** Do / don't guidance lists for MDX docs pages */

const GuidanceList = ({
  label,
  tone,
  iconName,
  items,
}: {
  label: string;
  tone: "do" | "dont";
  iconName: IconName;
  items: React.ReactNode[];
}) => {
  const classes = doDontListRecipe({ tone });

  return (
    <ul className={classes.list}>
      {items.map((item, index) => (
        <li key={index} className={classes.item}>
          <Icon name={iconName} size="sm" className={classes.mark} />
          <span className={classes.label}>{label}: </span>
          <span className={classes.content}>{item}</span>
        </li>
      ))}
    </ul>
  );
};

export const DoList = ({ items }: { items: React.ReactNode[] }) => (
  <GuidanceList label="Do" tone="do" iconName="circleCheck" items={items} />
);

export const DontList = ({ items }: { items: React.ReactNode[] }) => (
  <GuidanceList
    label="Don't"
    tone="dont"
    iconName="circleClose"
    items={items}
  />
);
