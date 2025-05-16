import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import { EditableField } from "@hashintel/block-design-system";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";

import { useEditorContext } from "./editor-context";
import { PersistedNetSelector } from "./persisted-net-selector";

export const TitleAndNetSelect = () => {
  const {
    entityId,
    parentProcess,
    persistedNets,
    switchToNet,
    setTitle,
    title,
  } = useEditorContext();

  const parentProcessPersistedNet = persistedNets.find(
    (net) => net.entityId === parentProcess?.entityId,
  );

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
      <Stack direction="row" alignItems="center" gap={1}>
        {parentProcessPersistedNet && (
          <>
            <Typography
              component="button"
              onClick={() => {
                switchToNet(parentProcessPersistedNet);
              }}
              sx={({ palette, transitions }) => ({
                background: "none",
                border: "none",
                color: palette.gray[80],
                cursor: "pointer",
                transition: transitions.create(["color"], {
                  duration: 150,
                }),
                whiteSpace: "nowrap",
                "&:hover": {
                  color: palette.common.black,
                },
              })}
            >
              {parentProcessPersistedNet.title}
            </Typography>
            <FontAwesomeIcon
              icon={faAngleRight}
              sx={({ palette }) => ({
                fontSize: 14,
                color: palette.gray[50],
                mx: 0,
              })}
            />
          </>
        )}
        <EditableField
          editIconFontSize={14}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Process"
        />
      </Stack>

      <PersistedNetSelector
        onSelect={switchToNet}
        options={persistedNets}
        value={entityId}
      />
    </Stack>
  );
};
