import type { Theme } from "@mui/material";
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import type { SystemStyleObject } from "@mui/system";
import { useSigma } from "@react-sigma/core";

import { useGraphContext } from "../graph-context";

type CheckboxListProps = {
  typesInData: { count: number; nodeTypeLabel: string; nodeTypeId: string }[];
};

export const filterButtonSx: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
  transitions,
}) => ({
  background: "transparent",
  border: "none",
  borderRadius: 1,
  cursor: "pointer",
  px: 1,
  py: 0.5,
  "& > span": {
    color: palette.blue[70],
    fontSize: 12,
  },
  "&:hover": {
    background: palette.blue[20],
  },
  transition: transitions.create("background"),
  visibility: "hidden",
});

export const NodeTypeFilters = ({ typesInData }: CheckboxListProps) => {
  const { filters, setFilters } = useGraphContext();

  const sigma = useSigma();

  const { setGraphState } = useGraphContext();

  const { colorByNodeTypeId, includeByNodeTypeId } = filters;

  return (
    <FormControl sx={{ maxWidth: "100%" }}>
      {Object.values(typesInData)
        .sort((a, b) => a.nodeTypeLabel.localeCompare(b.nodeTypeLabel))
        .map(({ nodeTypeLabel, nodeTypeId, count }) => {
          if (includeByNodeTypeId?.[nodeTypeId] === undefined) {
            /**
             * These should be set by {@link FilterControl} for any types in the graph.
             * We'll just return null if they're absent, they should load in imminently.
             */
            return null;
          }

          return (
            <Stack
              key={nodeTypeId}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Stack
                direction="row"
                alignItems="center"
                sx={{ "&:hover > button": { visibility: "visible" } }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      onChange={(event) => {
                        setFilters({
                          ...filters,
                          includeByNodeTypeId: {
                            ...includeByNodeTypeId,
                            [nodeTypeId]: event.target.checked,
                          },
                        });
                      }}
                      checked={includeByNodeTypeId[nodeTypeId]}
                      sx={{ mr: 1.5, "& .MuiSvgIcon-root": { fontSize: 18 } }}
                    />
                  }
                  label={`${nodeTypeLabel} (${count})`}
                  slotProps={{ typography: { fontSize: 14 } }}
                  sx={{
                    borderRadius: 1,
                    marginRight: 0,
                    marginLeft: 0.3,
                    px: 1,
                    py: 0.5,
                    "&:hover": {
                      background: ({ palette }) => palette.gray[20],
                    },
                  }}
                />
                <Box
                  component="button"
                  onClick={() => {
                    setFilters({
                      ...filters,
                      includeByNodeTypeId: {
                        /**
                         * We may have saved filters for types that aren't in this graph,
                         * and we want to preserve whatever visibility setting they had.
                         */
                        ...includeByNodeTypeId,
                        /**
                         * Disable visibility for all types currently in the graph.
                         */
                        ...typesInData.reduce<Record<string, boolean>>(
                          (acc, type) => {
                            acc[type.nodeTypeId] = false;
                            return acc;
                          },
                          {},
                        ),
                        [nodeTypeId]: true,
                      },
                    });
                  }}
                  sx={filterButtonSx}
                >
                  <Typography component="span">Only</Typography>
                </Box>
              </Stack>
              <Box
                aria-label={`Choose color for ${nodeTypeLabel}`}
                component="label"
                sx={{
                  background: colorByNodeTypeId?.[nodeTypeId],
                  borderRadius: 2,
                  border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                  height: 24,
                  width: 24,
                }}
              >
                <input
                  type="color"
                  onChange={(event) => {
                    const newColorSettings = {
                      ...colorByNodeTypeId,
                      [nodeTypeId]: event.target.value,
                    };

                    setFilters({
                      ...filters,
                      colorByNodeTypeId: newColorSettings,
                    });

                    setGraphState("colorByNodeTypeId", newColorSettings);

                    sigma.refresh({ skipIndexation: true });
                  }}
                  style={{ visibility: "hidden", width: 0 }}
                  value={colorByNodeTypeId?.[nodeTypeId]}
                />
              </Box>
            </Stack>
          );
        })}
    </FormControl>
  );
};
