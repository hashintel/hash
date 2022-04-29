import { BlockProtocolEntity, BlockProtocolEntityType } from "blockprotocol";
import * as React from "react";
import debounce from "lodash.debounce";
// eslint-disable-next-line no-restricted-imports
import Button from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Fade from "@mui/material/Fade";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";

import { EChart, SeriesOption, ECOption } from "./e-chart";

const StyledTextField = styled(TextField)(({ theme }) => ({
  "> .MuiInputBase-root > input": {
    padding: theme.spacing(1),
  },
  "> .MuiInputLabel-root.MuiInputLabel-formControl.MuiInputLabel-animated": {
    top: -8,
    "&.MuiInputLabel-shrink": {
      top: 0,
    },
  },
}));

const seriesNameAutocompleteMaxWidth = 150;
const deleteButtonWidth = 85;

type EditableGraphTitleProps = {
  title: string;
  updateTitle: (updatedTitle: string) => Promise<void>;
};

const EditableGraphTitle: React.FC<EditableGraphTitleProps> = ({
  title: initialTitle,
  updateTitle,
}) => {
  const [textFieldValue, setTextFieldValue] =
    React.useState<string>(initialTitle);

  const debouncedUpdateTitle = React.useMemo(
    () =>
      debounce(async (updatedTitle: string) => updateTitle(updatedTitle), 500),
    [updateTitle],
  );

  return (
    <StyledTextField
      value={textFieldValue}
      onChange={({ target }) => {
        const { value: updatedTitle } = target;

        setTextFieldValue(updatedTitle);
        void debouncedUpdateTitle(updatedTitle);
      }}
      sx={{
        width: 250,
        ".MuiOutlinedInput-notchedOutline": {
          borderColor: "transparent",
        },
      }}
      inputProps={{
        sx: {
          padding: 1,
        },
      }}
    />
  );
};

export type SeriesType = SeriesOption["type"];

export type SeriesDefinition = {
  seriesId: string;
  seriesType: SeriesType;
  seriesName: string;
  entityTypeId: string;
  xAxisPropertyKey: string;
  yAxisPropertyKey: string;
  aggregationResults: BlockProtocolEntity[];
};

const parsePossiblePropertyKeysFromEntityType = (
  entityType: BlockProtocolEntityType,
) =>
  entityType.properties && typeof entityType.properties === "object"
    ? Object.keys(entityType.properties)
    : [];

const CreateNewSeriesDefinition: React.FC<{
  possibleEntityTypes: BlockProtocolEntityType[];
  createDefinition: (params: {
    definition: Omit<SeriesDefinition, "seriesId" | "aggregationResults">;
  }) => Promise<void>;
  cancel: () => void;
}> = ({ createDefinition, cancel, possibleEntityTypes }) => {
  const [newDefinition, setNewDefinition] = React.useState<{
    entityType?: BlockProtocolEntityType;
    seriesName?: string;
    seriesType: SeriesType;
    xAxisPropertyKey?: string;
    yAxisPropertyKey?: string;
  }>({ seriesType: "scatter" });

  const reset = React.useCallback(
    () => setNewDefinition({ seriesType: "scatter" }),
    [],
  );

  const possiblePropertyKeys = React.useMemo(
    () =>
      newDefinition.entityType
        ? parsePossiblePropertyKeysFromEntityType(newDefinition.entityType)
        : [],
    [newDefinition.entityType],
  );

  const handleCreate = () => {
    if (
      !newDefinition.entityType ||
      !newDefinition.xAxisPropertyKey ||
      !newDefinition.yAxisPropertyKey ||
      !newDefinition.seriesName
    ) {
      return;
    }
    void createDefinition({
      definition: {
        seriesType: newDefinition.seriesType,
        seriesName: `${newDefinition.entityType.title} Series`,
        entityTypeId: newDefinition.entityType.entityTypeId,
        xAxisPropertyKey: newDefinition.xAxisPropertyKey,
        yAxisPropertyKey: newDefinition.yAxisPropertyKey,
      },
    }).then(() => {
      reset();
    });
  };

  const handleCancel = () => {
    reset();
    cancel();
  };

  return (
    <>
      <Divider sx={{ mt: 2 }} />
      <Box mt={2}>
        <Autocomplete
          sx={{
            ".MuiOutlinedInput-root": {
              padding: 0,
            },
            maxWidth: seriesNameAutocompleteMaxWidth,
          }}
          options={possibleEntityTypes}
          renderInput={(params) => (
            <StyledTextField {...params} label="Entity Type" />
          )}
          value={newDefinition.entityType ?? null}
          getOptionLabel={({ title }) => title}
          onChange={(_, selectedEntityType) => {
            if (selectedEntityType) {
              setNewDefinition((prev) => ({
                ...prev,
                entityType: selectedEntityType,
                seriesName: `${selectedEntityType.title} Series`,
              }));
            } else {
              reset();
            }
          }}
        />
      </Box>
      <Collapse in={!!newDefinition.entityType}>
        <Box
          display="flex"
          width="100%"
          sx={{
            mt: 2,
            "> :not(:last-child)": {
              mr: 0.5,
            },
          }}
        >
          <StyledTextField
            sx={{ flexGrow: 1, maxWidth: seriesNameAutocompleteMaxWidth }}
            label="Series Name"
            value={newDefinition.seriesName ?? ""}
            onChange={({ target }) =>
              setNewDefinition((prev) => ({
                ...prev,
                seriesName: target.value,
              }))
            }
          />
          <Box sx={{ minWidth: 120 }}>
            <FormControl fullWidth>
              <InputLabel>Series Type</InputLabel>
              <Select
                sx={{
                  "> .MuiSelect-select": {
                    padding: (theme) => theme.spacing(1),
                  },
                }}
                value={newDefinition.seriesType}
                label="Series Type"
                onChange={({ target }) =>
                  setNewDefinition((prev) => ({
                    ...prev,
                    seriesType: target.value as SeriesType,
                  }))
                }
              >
                <MenuItem value="line">Line</MenuItem>
                <MenuItem value="scatter">Scatter</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Autocomplete
            sx={{
              flexGrow: 1,
              ".MuiOutlinedInput-root": {
                padding: 0,
              },
            }}
            disabled={!newDefinition.entityType}
            options={possiblePropertyKeys}
            renderInput={(params) => (
              <StyledTextField {...params} label="X Axis Property" />
            )}
            value={newDefinition.xAxisPropertyKey ?? null}
            onChange={(_, selectedxAxisPropertyKey) => {
              setNewDefinition((prev) => ({
                ...prev,
                xAxisPropertyKey: selectedxAxisPropertyKey ?? undefined,
              }));
            }}
          />
          <Autocomplete
            sx={{
              flexGrow: 1,
              ".MuiOutlinedInput-root": {
                padding: 0,
              },
            }}
            disabled={!newDefinition.entityType}
            options={possiblePropertyKeys}
            renderInput={(params) => (
              <StyledTextField {...params} label="Y Axis Property" />
            )}
            value={newDefinition.yAxisPropertyKey ?? null}
            onChange={(_, selectedyAxisPropertyKey) => {
              setNewDefinition((prev) => ({
                ...prev,
                yAxisPropertyKey: selectedyAxisPropertyKey ?? undefined,
              }));
            }}
          />
          <Box width={deleteButtonWidth} />
        </Box>
      </Collapse>
      <Box mt={1}>
        <Button variant="outlined" onClick={handleCancel} sx={{ mr: 1 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={
            !newDefinition.entityType ||
            !newDefinition.xAxisPropertyKey ||
            !newDefinition.yAxisPropertyKey ||
            !newDefinition.seriesName
          }
          onClick={handleCreate}
        >
          Create
        </Button>
      </Box>
    </>
  );
};

const EditableGraphSeriesDefinition: React.FC<{
  possibleEntityTypes: BlockProtocolEntityType[];
  seriesDefinition: SeriesDefinition;
  updateSeriesDefinition: (params: {
    updatedDefinition: Partial<
      Omit<SeriesDefinition, "seriesId" | "aggregationResults">
    >;
  }) => Promise<void>;
  deleteSeriesDefinition: () => Promise<void>;
}> = ({
  possibleEntityTypes,
  seriesDefinition,
  updateSeriesDefinition,
  deleteSeriesDefinition,
}) => {
  const [isUpdating, setIsUpdating] = React.useState<boolean>(false);
  const [isDeleting, setIsDeleting] = React.useState<boolean>(false);

  const [seriesName, setSeriesName] = React.useState<string>(
    seriesDefinition.seriesName,
  );

  const debouncedUpdateSeriesName = React.useMemo(
    () =>
      debounce(async (updatedSeriesName: string) => {
        setIsUpdating(true);
        return updateSeriesDefinition({
          updatedDefinition: { seriesName: updatedSeriesName },
        }).then(() => {
          setIsUpdating(false);
        });
      }, 500),
    [updateSeriesDefinition],
  );

  const { entityTypeId, xAxisPropertyKey, yAxisPropertyKey, seriesType } =
    seriesDefinition;

  const entityType = possibleEntityTypes.find(
    (possibleEntityType) => possibleEntityType.entityTypeId === entityTypeId,
  );

  if (!entityType) {
    return null;
  }

  const possiblePropertyKeys =
    parsePossiblePropertyKeysFromEntityType(entityType);

  return (
    <Box mt={2}>
      <Box display="flex" justifyContent="space-between">
        <Typography sx={{ flexGrow: 1 }}>{entityType.title}</Typography>
        <Fade in={isUpdating}>
          <Typography>Saving</Typography>
        </Fade>
      </Box>
      <Box
        display="flex"
        sx={{
          mt: 1,
          "> :not(:last-child)": {
            mr: 0.5,
          },
        }}
      >
        <StyledTextField
          sx={{ flexGrow: 1, maxWidth: seriesNameAutocompleteMaxWidth }}
          label="Series Name"
          value={seriesName}
          onChange={({ target }) => {
            const updatedSeriesName = target.value;
            setSeriesName(updatedSeriesName);
            if (updatedSeriesName) {
              void debouncedUpdateSeriesName(updatedSeriesName);
            }
          }}
        />
        <Box sx={{ minWidth: 120 }}>
          <FormControl fullWidth>
            <InputLabel>Series Type</InputLabel>
            <Select
              sx={{
                "> .MuiSelect-select": {
                  padding: (theme) => theme.spacing(1),
                },
              }}
              value={seriesType}
              label="Series Type"
              onChange={({ target }) => {
                setIsUpdating(true);

                void updateSeriesDefinition({
                  updatedDefinition: {
                    seriesType: target.value as SeriesType,
                  },
                }).then(() => {
                  setIsUpdating(false);
                });
              }}
            >
              <MenuItem value="line">Line</MenuItem>
              <MenuItem value="scatter">Scatter</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Autocomplete
          sx={{
            flexGrow: 1,
            ".MuiOutlinedInput-root": {
              padding: 0,
            },
          }}
          options={possiblePropertyKeys}
          renderInput={(params) => (
            <StyledTextField {...params} label="X Axis Property" />
          )}
          disableClearable
          disabled={isUpdating || isDeleting}
          value={xAxisPropertyKey}
          onChange={(_, selectedxAxisPropertyKey) => {
            if (selectedxAxisPropertyKey) {
              setIsUpdating(true);

              void updateSeriesDefinition({
                updatedDefinition: {
                  xAxisPropertyKey: selectedxAxisPropertyKey,
                },
              }).then(() => {
                setIsUpdating(false);
              });
            }
          }}
        />
        <Autocomplete
          sx={{
            flexGrow: 1,
            ".MuiOutlinedInput-root": {
              padding: 0,
            },
          }}
          options={possiblePropertyKeys}
          disabled={isUpdating || isDeleting}
          renderInput={(params) => (
            <StyledTextField {...params} label="Y Axis Property" />
          )}
          disableClearable
          value={yAxisPropertyKey}
          onChange={(_, selectedyAxisPropertyKey) => {
            if (selectedyAxisPropertyKey) {
              setIsUpdating(true);
              void updateSeriesDefinition({
                updatedDefinition: {
                  yAxisPropertyKey: selectedyAxisPropertyKey,
                },
              }).then(() => {
                setIsUpdating(false);
              });
            }
          }}
        />
        <Button
          sx={{ width: deleteButtonWidth }}
          disabled={isDeleting}
          variant="contained"
          color="error"
          onClick={() => {
            setIsDeleting(true);
            void deleteSeriesDefinition().then(() => {
              setIsDeleting(false);
            });
          }}
        >
          Delete
        </Button>
      </Box>
    </Box>
  );
};

const EditableGraphSeriesDefinitions: React.FC<{
  possibleEntityTypes: BlockProtocolEntityType[];
  seriesDefinitions: SeriesDefinition[];
  updateSeriesDefinition: (params: {
    seriesId: string;
    updatedDefinition: Partial<
      Omit<SeriesDefinition, "seriesId" | "aggregationResults">
    >;
  }) => Promise<void>;
  createSeriesDefinition: (params: {
    definition: Omit<SeriesDefinition, "seriesId" | "aggregationResults">;
  }) => Promise<void>;
  deleteSeriesDefinition: (params: { seriesId: string }) => Promise<void>;
}> = ({
  possibleEntityTypes,
  seriesDefinitions,
  updateSeriesDefinition,
  createSeriesDefinition,
  deleteSeriesDefinition,
}) => {
  const [creatingNewDefinition, setCreatingNewDefinition] =
    React.useState<boolean>(false);

  const handleAddSeries = () => {
    setCreatingNewDefinition(true);
  };

  return (
    <>
      {seriesDefinitions.map((seriesDefinition) => (
        <EditableGraphSeriesDefinition
          key={seriesDefinition.seriesId}
          possibleEntityTypes={possibleEntityTypes}
          seriesDefinition={seriesDefinition}
          updateSeriesDefinition={({ updatedDefinition }) =>
            updateSeriesDefinition({
              seriesId: seriesDefinition.seriesId,
              updatedDefinition,
            })
          }
          deleteSeriesDefinition={() =>
            deleteSeriesDefinition({ seriesId: seriesDefinition.seriesId })
          }
        />
      ))}
      <Collapse in={creatingNewDefinition}>
        <CreateNewSeriesDefinition
          possibleEntityTypes={possibleEntityTypes}
          cancel={() => {
            setCreatingNewDefinition(false);
          }}
          createDefinition={(params) =>
            createSeriesDefinition(params).then(() => {
              setCreatingNewDefinition(false);
            })
          }
        />
      </Collapse>
      <Fade in={!creatingNewDefinition}>
        <Button sx={{ mt: 2 }} variant="contained" onClick={handleAddSeries}>
          Add Series
        </Button>
      </Fade>
    </>
  );
};

type EChartSeries = NonNullable<ECOption["series"]>;

export type GraphConfigProperties = {
  displayDataPointLabels: boolean;
  displayLegend: boolean;
};

const mapSeriesDefinitionsToEChartSeries = (params: {
  seriesDefinitions: SeriesDefinition[];
  config: GraphConfigProperties;
}): EChartSeries =>
  params.seriesDefinitions.map(
    ({
      seriesName,
      seriesType,
      xAxisPropertyKey,
      yAxisPropertyKey,
      aggregationResults,
    }) => {
      return {
        name: seriesName,
        type: seriesType,
        label: params.config.displayDataPointLabels
          ? {
              show: true,
              position: "top",
              color: "black",
              fontSize: 12,
              formatter: ({ name, data }) => `${name} ${data}`,
            }
          : undefined,
        data: aggregationResults.map((properties) => {
          if (!properties[xAxisPropertyKey]) {
            throw new Error(
              `No property with key '${xAxisPropertyKey}' found on entity`,
            );
          }
          if (!properties[xAxisPropertyKey]) {
            throw new Error(
              `No property with key '${xAxisPropertyKey}' found on entity`,
            );
          }

          const xValue = properties[xAxisPropertyKey];
          if (typeof xValue !== "number") {
            throw new Error("The x value is not a number");
          }

          const yValue = properties[yAxisPropertyKey];
          if (typeof yValue !== "number") {
            throw new Error("The y value is not a number");
          }

          return [xValue, yValue];
        }),
      };
    },
  );

type GraphProps = {
  title: string;
  updateTitle: (newTitle: string) => Promise<void>;
  xAxisName: string;
  yAxisName: string;
  possibleEntityTypes: BlockProtocolEntityType[];
  seriesDefinitions: SeriesDefinition[];
  updateSeriesDefinition: (params: {
    seriesId: string;
    updatedDefinition: Partial<
      Omit<SeriesDefinition, "seriesId" | "aggregationResults">
    >;
  }) => Promise<void>;
  createSeriesDefinition: (params: {
    definition: Omit<SeriesDefinition, "seriesId" | "aggregationResults">;
  }) => Promise<void>;
  deleteSeriesDefinition: (params: { seriesId: string }) => Promise<void>;
  config: GraphConfigProperties;
};

export const Graph: React.FC<GraphProps> = ({
  title,
  updateTitle,
  xAxisName,
  yAxisName,
  possibleEntityTypes,
  seriesDefinitions,
  updateSeriesDefinition,
  createSeriesDefinition,
  deleteSeriesDefinition,
  config,
}) => {
  const series = React.useMemo(
    () => mapSeriesDefinitionsToEChartSeries({ seriesDefinitions, config }),
    [seriesDefinitions, config],
  );

  return (
    <>
      <EditableGraphTitle title={title} updateTitle={updateTitle} />
      <EChart
        options={{
          /** @todo: figure out why this isn't working */
          legend: config.displayLegend
            ? {
                data: seriesDefinitions.map(({ seriesName }) => seriesName),
              }
            : undefined,
          yAxis: {
            type: "value",
            name: yAxisName,
          },
          xAxis: {
            type: "value",
            name: xAxisName,
          },
          series,
        }}
      />
      <EditableGraphSeriesDefinitions
        possibleEntityTypes={possibleEntityTypes}
        seriesDefinitions={seriesDefinitions}
        updateSeriesDefinition={updateSeriesDefinition}
        createSeriesDefinition={createSeriesDefinition}
        deleteSeriesDefinition={deleteSeriesDefinition}
      />
    </>
  );
};
