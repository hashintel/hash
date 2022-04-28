import { BlockProtocolEntity, BlockProtocolEntityType } from "blockprotocol";
import * as React from "react";
import debounce from "lodash.debounce";
// eslint-disable-next-line no-restricted-imports
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { EChart, SeriesOption, ECOption } from "./e-chart";

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
    <TextField
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
}> = ({ createDefinition, possibleEntityTypes }) => {
  const [newDefinition, setNewDefinition] = React.useState<{
    entityType?: BlockProtocolEntityType;
    xAxisPropertyKey?: string;
    yAxisPropertyKey?: string;
  }>({});

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
      !newDefinition.yAxisPropertyKey
    ) {
      return;
    }
    void createDefinition({
      definition: {
        seriesType: "scatter",
        entityTypeId: newDefinition.entityType.entityTypeId,
        xAxisPropertyKey: newDefinition.xAxisPropertyKey,
        yAxisPropertyKey: newDefinition.yAxisPropertyKey,
      },
    });
  };

  return (
    <Box display="flex" width="100%">
      <Autocomplete
        sx={{ flexGrow: 1 }}
        options={possibleEntityTypes}
        renderInput={(params) => <TextField {...params} label="Entity Type" />}
        value={newDefinition.entityType}
        getOptionLabel={({ title }) => title}
        disableClearable
        onChange={(_, selectedEntityType) => {
          if (selectedEntityType) {
            setNewDefinition({
              entityType: selectedEntityType,
            });
          }
        }}
      />
      <Autocomplete
        sx={{ flexGrow: 1 }}
        disabled={!newDefinition.entityType}
        options={possiblePropertyKeys}
        renderInput={(params) => (
          <TextField {...params} label="X Axis Property" />
        )}
        disableClearable
        value={newDefinition.xAxisPropertyKey}
        onChange={(_, selectedxAxisPropertyKey) => {
          if (selectedxAxisPropertyKey) {
            setNewDefinition((prev) => ({
              ...prev,
              xAxisPropertyKey: selectedxAxisPropertyKey,
            }));
          }
        }}
      />
      <Autocomplete
        sx={{ flexGrow: 1 }}
        disabled={!newDefinition.entityType}
        options={possiblePropertyKeys}
        renderInput={(params) => (
          <TextField {...params} label="Y Axis Property" />
        )}
        disableClearable
        value={newDefinition.yAxisPropertyKey}
        onChange={(_, selectedyAxisPropertyKey) => {
          if (selectedyAxisPropertyKey) {
            setNewDefinition((prev) => ({
              ...prev,
              yAxisPropertyKey: selectedyAxisPropertyKey,
            }));
          }
        }}
      />
      <Button
        variant="contained"
        disabled={
          !newDefinition.entityType ||
          !newDefinition.xAxisPropertyKey ||
          !newDefinition.yAxisPropertyKey
        }
        onClick={handleCreate}
      >
        Create
      </Button>
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
      <h2>Graph Series Definitions</h2>
      {seriesDefinitions.map(
        ({ seriesId, entityTypeId, xAxisPropertyKey, yAxisPropertyKey }) => {
          const entityType = possibleEntityTypes.find(
            (possibleEntityType) =>
              possibleEntityType.entityTypeId === entityTypeId,
          );

          if (!entityType) {
            return null;
          }

          const possiblePropertyKeys =
            parsePossiblePropertyKeysFromEntityType(entityType);

          return (
            <Box display="flex" key={seriesId}>
              <Typography sx={{ flexGrow: 1 }}>{entityType.title}</Typography>
              <Autocomplete
                sx={{ flexGrow: 1 }}
                options={possiblePropertyKeys}
                renderInput={(params) => (
                  <TextField {...params} label="X Axis Property" />
                )}
                disableClearable
                value={xAxisPropertyKey}
                onChange={(_, selectedxAxisPropertyKey) => {
                  if (selectedxAxisPropertyKey) {
                    void updateSeriesDefinition({
                      seriesId,
                      updatedDefinition: {
                        xAxisPropertyKey: selectedxAxisPropertyKey,
                      },
                    });
                  }
                }}
              />
              <Autocomplete
                sx={{ flexGrow: 1 }}
                options={possiblePropertyKeys}
                renderInput={(params) => (
                  <TextField {...params} label="Y Axis Property" />
                )}
                disableClearable
                value={yAxisPropertyKey}
                onChange={(_, selectedyAxisPropertyKey) => {
                  if (selectedyAxisPropertyKey) {
                    void updateSeriesDefinition({
                      seriesId,
                      updatedDefinition: {
                        yAxisPropertyKey: selectedyAxisPropertyKey,
                      },
                    });
                  }
                }}
              />
              <Button onClick={() => deleteSeriesDefinition({ seriesId })}>
                Delete
              </Button>
            </Box>
          );
        },
      )}
      {creatingNewDefinition ? (
        <CreateNewSeriesDefinition
          possibleEntityTypes={possibleEntityTypes}
          createDefinition={(params) =>
            createSeriesDefinition(params).then(() => {
              setCreatingNewDefinition(false);
            })
          }
        />
      ) : (
        <Button variant="contained" onClick={handleAddSeries}>
          Add Series
        </Button>
      )}
    </>
  );
};

type EChartSeries = NonNullable<ECOption["series"]>;

const mapSeriesDefinitionsToEChartSeries = (params: {
  seriesDefinitions: SeriesDefinition[];
}): EChartSeries =>
  params.seriesDefinitions.map(
    ({
      seriesType,
      xAxisPropertyKey,
      yAxisPropertyKey,
      aggregationResults,
    }) => {
      return {
        type: seriesType,
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
}) => {
  const series = React.useMemo(
    () => mapSeriesDefinitionsToEChartSeries({ seriesDefinitions }),
    [seriesDefinitions],
  );

  return (
    <>
      <EditableGraphTitle title={title} updateTitle={updateTitle} />
      <EChart
        options={{
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
