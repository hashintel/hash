import type { EntityId } from "@blockprotocol/type-system";
import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import { EditableField } from "@hashintel/block-design-system";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";

import { NetSelector } from "./process-editor";
import type { PersistedNet } from "./use-process-save-and-load";

export const TitleAndNetSelect = ({
  parentNet,
  persistedNets,
  selectedNetId,
  setTitle,
  switchToNet,
  title,
}: {
  parentNet: { parentNetId: EntityId; title: string } | null;
  persistedNets: PersistedNet[];
  selectedNetId: EntityId | null;
  setTitle: (title: string) => void;
  switchToNet: (net: PersistedNet) => void;
  title: string;
}) => {
  const parentNetPersistedNet = persistedNets.find(
    (net) => net.entityId === parentNet?.parentNetId,
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
        {parentNetPersistedNet && (
          <>
            <Typography
              component="button"
              onClick={() => {
                switchToNet(parentNetPersistedNet);
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
              {parentNetPersistedNet.title}
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

      <NetSelector
        disabledOptions={selectedNetId ? [selectedNetId] : undefined}
        key={selectedNetId}
        onSelect={(net) => {
          const foundNet = persistedNets.find(
            (netOption) => net.netId === netOption.entityId,
          );

          if (!foundNet) {
            throw new Error(`Net ${net.netId} not found`);
          }

          switchToNet(foundNet);
        }}
        options={persistedNets.map((net) => ({
          netId: net.entityId,
          title: net.title,
        }))}
        value={selectedNetId}
      />
    </Stack>
  );
};
