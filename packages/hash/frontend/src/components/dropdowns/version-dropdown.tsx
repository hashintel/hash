import { Box } from "@mui/material";
import { formatDistance } from "date-fns";
import { ChangeEvent, FunctionComponent } from "react";

type VersionDropdownProps = {
  onChange: (value?: string) => void;
  value?: string;
  versions: {
    createdAt: string;
    entityVersionId: string;
  }[];
};

export const VersionDropdown: FunctionComponent<VersionDropdownProps> = ({
  onChange,
  value,
  versions,
}) => {
  const now = new Date();

  return (
    // @todo use MUI Select component for this instead
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
