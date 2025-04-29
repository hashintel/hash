import { EditableField } from "@hashintel/block-design-system";
import { Stack } from "@mui/material";

import { useEditorContext } from "./editor-context";
import { PersistedNetSelector } from "./persisted-net-selector";

export const TitleAndNetSelect = () => {
  const { entityId, loadPersistedNet, persistedNets, setTitle, title } =
    useEditorContext();

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      sx={({ palette }) => ({
        background: palette.gray[5],
        borderBottom: `1px solid ${palette.gray[20]}`,
        py: 1,
        px: 2,
      })}
    >
      <EditableField
        editIconFontSize={14}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Process"
      />

      <PersistedNetSelector
        onSelect={loadPersistedNet}
        options={persistedNets}
        value={entityId}
      />
    </Stack>
  );
};
