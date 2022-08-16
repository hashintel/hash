import jsonpath from "jsonpath";
import {
  Dispatch,
  ReactElement,
  SetStateAction,
  useMemo,
  useState,
} from "react";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";
import { UnknownRecord } from "@blockprotocol/core";
import { Box, Typography } from "@mui/material";
import { faClose, faEye } from "@fortawesome/free-solid-svg-icons";
import { BlockGraph, Entity } from "@blockprotocol/graph";
import {
  FontAwesomeIcon,
  IconButton,
  MenuItem,
  Select,
  TextField,
} from "@hashintel/hash-design-system";
import { dataTreeFromEntityGraph, SchemaMap } from "./shared";
import { DataMapPreview } from "./data-map-editor/data-map-preview";

type DataMapperProps = {
  close: () => void;
  mapId: string;
  schemaMap?: SchemaMap;
  sourceBlockEntity: Entity;
  sourceBlockGraph: BlockGraph;
  targetSchema: JsonSchema;
  transformedTree: UnknownRecord;
  onSchemaMapChange: Dispatch<SetStateAction<SchemaMap>>;
};

/**
 * Generates an array of strings, each of which represents a path in an object
 * Where paths are nested, they are dot-separated, e.g. "address.city"
 * These are jsonpaths with the leading "$." stripped for use in lodash methods
 */
const derivePathsFromObject = (object: {}) =>
  jsonpath.paths(object, "$..*").map((path) => path.slice(1).join("."));

/**
 * Derive paths to a theoretical JSON object from a JSON schema and a set of properties
 * Based on https://stackoverflow.com/a/60297881
 * This does not handle $defs since we will not have them in the new type system.
 */
const derivePathsFromSchema = (
  schema: JsonSchema,
  schemaProperties: JsonSchema["properties"],
  allPathsSoFar: string[] = [],
): string[] => {
  if (!schemaProperties) {
    return allPathsSoFar;
  }
  return Object.entries(schemaProperties).reduce(
    (pathAccumulator, [currentKey, currentSchema]) => {
      if (!currentSchema) {
        return pathAccumulator;
      }
      if (currentSchema.type === "object") {
        return pathAccumulator.concat(
          currentKey,
          derivePathsFromSchema(
            schema,
            currentSchema.properties,
            allPathsSoFar,
          ).map((path) => `${currentKey}.${path}`),
        );
      }
      if (
        currentSchema.type === "array" &&
        currentSchema.items &&
        "properties" in currentSchema.items
      ) {
        return pathAccumulator.concat(
          currentKey,
          `${currentKey}[]`,
          derivePathsFromSchema(
            schema,
            currentSchema.items.properties,
            allPathsSoFar,
          ).map((path) => `${currentKey}[].${path}`),
        );
      }

      return pathAccumulator.concat(currentKey);
    },
    allPathsSoFar,
  );
};

/**
 * Given a JSON schema and nested path to a hypothetical data object, e.g. "address.city",
 * returns the schema for that specific property, and whether or not it is required in the object it belongs to
 */
const schemaByPathParts = (
  schema: JsonSchema,
  pathParts: string[],
): { required: boolean; schema: JsonSchema } => {
  if (!schema.properties) {
    throw new Error("Schema has no properties");
  }

  const firstKey = pathParts[0]!;

  if (!schema.properties[firstKey]) {
    throw new Error("No schema found");
  }

  if (pathParts.length === 1) {
    const required =
      Array.isArray(schema.required) && schema.required.includes(firstKey);
    return { required, schema: schema.properties[firstKey]! };
  }

  return schemaByPathParts(schema.properties[firstKey]!, pathParts.slice(1));
};

/**
 * Produces an initial set of transformations consisting of exact matches between source and target paths.
 */
const generateInitialTransformations = (
  sourcePaths: string[],
  targetPaths: string[],
): SchemaMap["transformations"] => {
  const matchingKeys = sourcePaths.filter((sourcePath) =>
    targetPaths.includes(sourcePath),
  );

  if (!matchingKeys) {
    return undefined;
  }

  return matchingKeys.reduce<NonNullable<SchemaMap["transformations"]>>(
    (obj, key) => {
      /* eslint-disable no-param-reassign */
      obj[key] ??= {};
      obj[key]!.sourceKey = key;
      /* eslint-enable no-param-reassign */
      return obj;
    },
    {},
  );
};

/**
 * Prototype for translating from a source data tree to a target schema.
 * Known issues / future work:
 * 1. This uses the source entity data to map from, not a source schema, because we don't express linked entities in a schema.
 *    Therefore, it will only be able to assign source properties that are defined on the particular entity at hand.
 *    - @todo use the source schema(s), not instances of them, to build maps, to cover all potential properties
 * 2. The data is stored in localStorage, and thus only works per user/session. Blocks won't appear mapped to other users.
 *    - @todo store maps in a database
 * 3. Proper exploration as to how this works in practice and what additional functionality is required.
 */
export const DataMapEditor = ({
  close,
  mapId,
  schemaMap,
  sourceBlockEntity,
  sourceBlockGraph,
  targetSchema,
  transformedTree,
  onSchemaMapChange,
}: DataMapperProps): ReactElement => {
  const [showPreview, setShowPreview] = useState(false);

  const { sourcePaths, sourceTree } = useMemo(() => {
    const tree = dataTreeFromEntityGraph(sourceBlockEntity, sourceBlockGraph);
    const paths: string[] = derivePathsFromObject(tree);
    return {
      sourceTree: tree,
      sourcePaths: paths,
    };
  }, [sourceBlockEntity, sourceBlockGraph]);

  const targetPaths = useMemo(
    () => derivePathsFromSchema(targetSchema, targetSchema.properties),
    [targetSchema],
  );

  if (!schemaMap?.transformations) {
    const initialTransformations = generateInitialTransformations(
      sourcePaths,
      targetPaths,
    );
    onSchemaMapChange((map) => ({
      ...map,
      transformations: initialTransformations ?? {},
    }));
  }

  return (
    <Box sx={{ position: "relative" }}>
      <IconButton
        sx={{
          position: "absolute",
          top: 8,
          right: 0,
        }}
        onClick={() => close()}
        type="button"
      >
        <FontAwesomeIcon
          icon={faClose}
          sx={{
            color: "gray.50",
            fontSize: 24,
          }}
        />
      </IconButton>
      <Box>
        <Box
          sx={({ palette }) => ({
            display: "flex",
            borderBottom: `1px solid ${palette.gray[30]}`,
            py: 1,
          })}
        >
          <Box width="30%">
            <Typography fontWeight={600} variant="smallTextLabels">
              Target path
            </Typography>
          </Box>
          <Box width="30%">
            <Typography fontWeight={600} variant="smallTextLabels">
              Source path
            </Typography>
          </Box>
          <Box width="30%" ml={4}>
            <Typography fontWeight={600} variant="smallTextLabels">
              Default
            </Typography>
          </Box>
        </Box>

        {targetPaths.map((targetPath) => {
          const { required, schema: targetPathSchema } = schemaByPathParts(
            targetSchema,
            targetPath.split("."),
          );

          const { description, type } = targetPathSchema;

          return (
            <Box
              key={targetPath}
              sx={({ palette }) => ({
                py: 1,
                display: "flex",
                alignItems: "center",
                borderBottom: `1px solid ${palette.gray[20]}`,
              })}
            >
              <Box width="30%">
                <Typography fontWeight={500} variant="smallTextLabels">
                  {targetPath}
                  {required ? "*" : ""}
                  <Typography fontWeight={300} ml={1} variant="microText">
                    {Array.isArray(type) ? type.join(", ") : type}
                  </Typography>
                </Typography>
                <Typography
                  sx={({ palette }) => ({
                    color: palette.gray[50],
                  })}
                  fontWeight={300}
                  component="p"
                  variant="microText"
                >
                  {description ?? "No description provided"}
                </Typography>
              </Box>
              <Box width="30%">
                <Select
                  size="small"
                  defaultValue={
                    schemaMap?.transformations?.[targetPath]?.sourceKey ??
                    "__nothing"
                  }
                  onChange={(evt) =>
                    onSchemaMapChange((existingMap) => ({
                      ...(existingMap ?? { mapId }),
                      transformations: {
                        ...existingMap.transformations,
                        [targetPath]: {
                          default:
                            existingMap.transformations?.[targetPath]?.default,
                          sourceKey:
                            evt.target.value === "__nothing"
                              ? undefined
                              : evt.target.value,
                        },
                      },
                    }))
                  }
                >
                  <MenuItem value="__nothing">-----------------</MenuItem>
                  {sourcePaths.map((path) => {
                    return (
                      <MenuItem key={path} value={path}>
                        {path}
                      </MenuItem>
                    );
                  })}
                </Select>
              </Box>
              <Box width="30%" ml={4}>
                <TextField
                  size="small"
                  value={schemaMap?.transformations?.[targetPath]?.default}
                  onChange={(evt) =>
                    onSchemaMapChange((existingMap) => ({
                      ...(existingMap ?? { mapId }),
                      transformations: {
                        ...existingMap.transformations,
                        [targetPath]:
                          evt.target.value != null
                            ? {
                                default: evt.target.value,
                                sourceKey:
                                  existingMap.transformations?.[targetPath]
                                    ?.sourceKey,
                              }
                            : undefined,
                      },
                    }))
                  }
                />
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box>
        <IconButton
          sx={{
            position: "absolute",
            bottom: -32,
            right: 0,
          }}
          onClick={() => setShowPreview(!showPreview)}
        >
          <FontAwesomeIcon icon={faEye} />
        </IconButton>
      </Box>
      {showPreview && (
        <DataMapPreview
          sourceTree={sourceTree}
          targetSchema={targetSchema}
          transformedTree={transformedTree}
        />
      )}
    </Box>
  );
};
