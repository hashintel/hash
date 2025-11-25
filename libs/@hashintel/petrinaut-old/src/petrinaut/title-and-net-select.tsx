import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import { EditableField } from "@hashintel/block-design-system";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";

import { useEditorContext } from "./editor-context";
import { NetSelector } from "./net-selector";

export const TitleAndNetSelect = () => {
  const { existingNets, loadPetriNet, parentNet, petriNetId, setTitle, title } =
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
      <Stack direction="row" alignItems="center" gap={1}>
        {parentNet && (
          <>
            <Typography
              component="button"
              onClick={() => {
                loadPetriNet(parentNet.parentNetId);
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
              {parentNet.title}
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
        disabledOptions={petriNetId ? [petriNetId] : undefined}
        key={petriNetId}
        onSelect={(net) => {
          loadPetriNet(net.netId);
        }}
        options={existingNets.map((net) => ({
          netId: net.netId,
          title: net.title,
        }))}
        value={petriNetId}
      />
    </Stack>
  );
};
