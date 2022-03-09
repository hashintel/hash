import { VoidFunctionComponent, ChangeEvent } from "react";
import { formatDistance } from "date-fns";
import { Box } from "@mui/material";

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
    <Box
      component="select"
      sx={{
        padding: "8px 15px",
        border: "1px solid lightgray",
        width: 200,
        borderRadius: "4px",
      }}
      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
        onChange(event.target.value)
      }
      value={value}
    >
      {versions.map((version) => (
        <option key={version.entityVersionId} value={version.entityVersionId}>
          {formatDistance(new Date(version.createdAt), now, {
            addSuffix: true,
          })}
        </option>
      ))}
    </Box>
  );
};
