import { VoidFunctionComponent } from "react";
import { formatDistance } from "date-fns";

import styles from "../layout/PageSidebar/PageSidebar.module.scss";

type VersionDropdownProps = {
  onChange: (value?: string) => void;
  value?: string;
  versions: {
    createdAt: string;
    entityId: string;
  }[];
};

export const VersionDropdown: VoidFunctionComponent<VersionDropdownProps> = ({
  onChange,
  value,
  versions,
}) => {
  // const options = versions.map(({ createdAt, entityId }) => ({
  //   label: formatDistance(new Date(createdAt), new Date(), {
  //     addSuffix: true,
  //   }),
  //   value: entityId,
  // }));

  const now = new Date();

  return (
    <select
      className={styles.AccountSelect}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: 200 }}
      value={
        versions.find((version) => value === version.createdAt)?.entityId ??
        null
      }
    >
      {versions.map((version) => (
        <option key={version.entityId} value={version.entityId}>
          {formatDistance(new Date(version.createdAt), now, {
            addSuffix: true,
          })}
        </option>
      ))}
    </select>
  );

  // return <Dropdown onChange={onChange} options={options} value={value} />;
};
