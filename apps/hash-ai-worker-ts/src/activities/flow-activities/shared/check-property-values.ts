import { typedEntries } from "@local/advanced-types/typed-entries";
import { HashEntity } from "@local/hash-graph-sdk/entity";

import { extractErrorMessage } from "../../infer-entities/shared/extract-validation-failure-details.js";
import { graphApiClient } from "../../shared/graph-api-client.js";

import type {
  PropertyObjectWithMetadata,
  UserId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  DataTypeInferenceError,
  ObjectPropertyValidationReport,
} from "@local/hash-graph-sdk/validation";

const singularOrList = {
  value: "a single value",
  array: "a list",
  object: "a property object",
};

/** The graph's reasons it couldn't infer a value's data type, anywhere in a property's report, e.g. in a list's items. */
const findDataTypeInferenceErrors = (
  report: unknown,
): DataTypeInferenceError[] => {
  if (typeof report !== "object" || report === null) {
    return [];
  }

  if (Array.isArray(report)) {
    return report.flatMap(findDataTypeInferenceErrors);
  }

  return Object.entries(report).flatMap(([key, value]) =>
    key === "dataTypeInference"
      ? (value as DataTypeInferenceError[])
      : findDataTypeInferenceErrors(value),
  );
};

/** Why the graph rejected a property's value, as a reason that follows the property's name. */
const describeReport = (report: ObjectPropertyValidationReport): string => {
  switch (report.type) {
    case "unexpected":
      return "isn't a property of the entity type";
    case "missing":
      return "is required";
    case "wrongType":
      return `takes ${singularOrList[report.data.expected]}, but was given ${singularOrList[report.data.actual]}`;
  }

  /* Values are given without a data type ID, so the graph can only infer one for a property with a single concrete data type. */
  const inferenceErrors = findDataTypeInferenceErrors(report);

  if (inferenceErrors.some(({ type }) => type === "ambiguous")) {
    return "allows more than one data type, and a flow can't yet say which one its value has";
  }

  if (inferenceErrors.some(({ type }) => type === "abstract")) {
    return "only allows an abstract data type, and a flow can't yet say which of its subtypes its value has";
  }

  return "has a value its property type doesn't allow";
};

/**
 * Checks property values against entity types, as the user running the flow, so that the step can name each
 * property whose value the graph would reject. Returns why they're invalid, or `undefined` if they're valid.
 *
 * Required properties are only checked if `requiredProperties` is set: an update gives only the properties it changes,
 * and a draft may leave required properties out.
 */
export const checkPropertyValues = async ({
  actorId,
  entityTypeIds,
  properties,
  requiredProperties,
}: {
  actorId: UserId;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObjectWithMetadata;
  requiredProperties: boolean;
}): Promise<string | undefined> => {
  let report;

  try {
    report = await HashEntity.validate(
      graphApiClient,
      { actorId },
      {
        entityTypes: entityTypeIds,
        properties,
        components: {
          linkData: false,
          linkValidation: false,
          numItems: true,
          requiredProperties,
        },
      },
    );
  } catch (error) {
    return `Could not check the property values against ${entityTypeIds.join(", ")}: ${extractErrorMessage(error)}`;
  }

  if (!report) {
    return undefined;
  }

  const propertyErrors = typedEntries(report.properties ?? {}).map(
    ([baseUrl, propertyReport]) =>
      `Property ${baseUrl} ${describeReport(propertyReport)}.`,
  );

  return propertyErrors.length > 0
    ? propertyErrors.join(" ")
    : `The property values don't fit ${entityTypeIds.join(", ")}: ${JSON.stringify(report)}`;
};
