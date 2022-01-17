import { VoidFunctionComponent } from "react";
import { formatDistance } from "date-fns";

import styles from "../layout/PageSidebar/PageSidebar.module.scss";

type VersionDropdownProps = {
  onChange: (value?: string) => void;
  value?: string;
  versions: {
    createdAt: string;
    entityVersionId: string;
  }[];
};

export const VersionDropdown: VoidFunctionComponent<VersionDropdownProps> = ({
  onChange,
  value,
  versions,
}) => {
  const now = new Date();

  return (
    <select
      className={styles.AccountSelect}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: 200 }}
      value={value}
    >
      {versions.map((version) => (
        <option key={version.entityVersionId} value={version.entityVersionId}>
          {formatDistance(new Date(version.createdAt), now, {
            addSuffix: true,
          })}
        </option>
      ))}
    </select>
  );
};
