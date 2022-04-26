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
  seriesType: SeriesType;
  entityTypeId: string;
  xValuePropertyKey: string;
  yValuePropertyKey: string;
};

const parsePossiblePropertyKeysFromEntityType = (
  entityType: BlockProtocolEntityType,
) =>
  entityType.properties && typeof entityType.properties === "object"
    ? Object.keys(entityType.properties)
    : [];

const CreateNewSeriesDefinition: React.FC<{
  possibleEntityTypes: BlockProtocolEntityType[];
  createNewDefinition: (params: { definition: SeriesDefinition }) => void;
}> = ({ createNewDefinition, possibleEntityTypes }) => {
  const [newDefinition, setNewDefinition] = React.useState<{
    entityType?: BlockProtocolEntityType;
    xValuePropertyKey?: string;
    yValuePropertyKey?: string;
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
      !newDefinition.xValuePropertyKey ||
      !newDefinition.yValuePropertyKey
    ) {
      return;
    }
    createNewDefinition({
      definition: {
        seriesType: "scatter",
        entityTypeId: newDefinition.entityType.entityTypeId,
        xValuePropertyKey: newDefinition.xValuePropertyKey,
        yValuePropertyKey: newDefinition.yValuePropertyKey,
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
        value={newDefinition.xValuePropertyKey}
        onChange={(_, selectedXValuePropertyKey) => {
          if (selectedXValuePropertyKey) {
            setNewDefinition((prev) => ({
              ...prev,
              xValuePropertyKey: selectedXValuePropertyKey,
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
        value={newDefinition.yValuePropertyKey}
        onChange={(_, selectedYValuePropertyKey) => {
          if (selectedYValuePropertyKey) {
            setNewDefinition((prev) => ({
              ...prev,
              yValuePropertyKey: selectedYValuePropertyKey,
            }));
          }
        }}
      />
      <Button
        variant="contained"
        disabled={
          !newDefinition.entityType ||
          !newDefinition.xValuePropertyKey ||
          !newDefinition.yValuePropertyKey
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
  existingDefinitions: SeriesDefinition[];
  setExistingDefinitions: React.Dispatch<
    React.SetStateAction<SeriesDefinition[]>
  >;
}> = ({ possibleEntityTypes, existingDefinitions, setExistingDefinitions }) => {
  const [creatingNewDefinition, setCreatingNewDefinition] =
    React.useState<boolean>(false);

  const handleAddSeries = () => {
    setCreatingNewDefinition(true);
  };

  const handleCreateNewDefinition = (params: {
    definition: SeriesDefinition;
  }) => {
    setExistingDefinitions((prevDefinitions) => [
      ...prevDefinitions,
      params.definition,
    ]);
    setCreatingNewDefinition(false);
  };

  return (
    <>
      <h2>Graph Series Definitions</h2>
      {existingDefinitions.map(
        ({ entityTypeId, xValuePropertyKey, yValuePropertyKey }, i) => {
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
            <Box display="flex" key={entityTypeId}>
              <Typography sx={{ flexGrow: 1 }}>{entityType.title}</Typography>
              <Autocomplete
                sx={{ flexGrow: 1 }}
                options={possiblePropertyKeys}
                renderInput={(params) => (
                  <TextField {...params} label="X Axis Property" />
                )}
                disableClearable
                value={xValuePropertyKey}
                onChange={(_, selectedXValuePropertyKey) => {
                  if (selectedXValuePropertyKey) {
                    setExistingDefinitions((prev) => [
                      ...prev.slice(0, i),
                      {
                        ...prev[i]!,
                        xValuePropertyKey: selectedXValuePropertyKey,
                      },
                      ...prev.slice(i + 1),
                    ]);
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
                value={yValuePropertyKey}
                onChange={(_, selectedYValuePropertyKey) => {
                  if (selectedYValuePropertyKey) {
                    setExistingDefinitions((prev) => [
                      ...prev.slice(0, i),
                      {
                        ...prev[i]!,
                        yValuePropertyKey: selectedYValuePropertyKey,
                      },
                      ...prev.slice(i + 1),
                    ]);
                  }
                }}
              />
            </Box>
          );
        },
      )}
      {creatingNewDefinition ? (
        <CreateNewSeriesDefinition
          possibleEntityTypes={possibleEntityTypes}
          createNewDefinition={handleCreateNewDefinition}
        />
      ) : (
        <Button variant="contained" onClick={handleAddSeries}>
          Add Series
        </Button>
      )}
    </>
  );
};

type GraphProps = {
  title: string;
  xAxisName: string;
  yAxisName: string;
  possibleEntityTypes: BlockProtocolEntityType[];

  fetchEntitiesOfType: (params: {
    entityTypeId: string;
  }) => Promise<BlockProtocolEntity[]>;
  updateTitle: (newTitle: string) => Promise<void>;
};

type Series = NonNullable<ECOption["series"]>;

export const Graph: React.FC<GraphProps> = ({
  title,
  xAxisName,
  yAxisName,
  fetchEntitiesOfType,
  possibleEntityTypes,
  updateTitle,
}) => {
  const [seriesDefinitions, setSeriesDefinitions] = React.useState<
    SeriesDefinition[]
  >([]);

  const [series, setSeries] = React.useState<Series>([]);

  const populateSeries = React.useCallback(
    async (definitions: SeriesDefinition[]) => {
      const updatedSeries: Series = await Promise.all(
        definitions.map(
          async ({
            seriesType,
            entityTypeId,
            xValuePropertyKey,
            yValuePropertyKey,
          }) => {
            const allEntitiesOfType = await fetchEntitiesOfType({
              entityTypeId,
            });

            return {
              type: seriesType,
              data: allEntitiesOfType.map((properties) => {
                if (!properties[xValuePropertyKey]) {
                  throw new Error(
                    `No property with key '${xValuePropertyKey}' found on entity`,
                  );
                }
                if (!properties[xValuePropertyKey]) {
                  throw new Error(
                    `No property with key '${xValuePropertyKey}' found on entity`,
                  );
                }

                const xValue = properties[xValuePropertyKey];
                if (typeof xValue !== "number") {
                  throw new Error("The x value is not a number");
                }

                const yValue = properties[yValuePropertyKey];
                if (typeof yValue !== "number") {
                  throw new Error("The y value is not a number");
                }

                return [xValue, yValue];
              }),
            };
          },
        ),
      );

      setSeries(updatedSeries);
    },
    [fetchEntitiesOfType, setSeries],
  );

  React.useEffect(() => {
    void populateSeries(seriesDefinitions);
  }, [seriesDefinitions, populateSeries]);

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
        existingDefinitions={seriesDefinitions}
        setExistingDefinitions={setSeriesDefinitions}
      />
    </>
  );
};
