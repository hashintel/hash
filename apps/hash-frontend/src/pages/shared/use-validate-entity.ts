import { useLazyQuery } from "@apollo/client";
import type {
  BaseUrl,
  PropertyObjectWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { ArrayItemNumberMismatch } from "@local/hash-graph-client/api";
import type {
  EntityValidationReport,
  ObjectValidationReport,
  ValueValidationError,
} from "@local/hash-graph-sdk/validation";
import { useCallback } from "react";

import type {
  ValidateEntityQuery,
  ValidateEntityQueryVariables,
} from "../../graphql/api-types.gen";
import { validateEntityQuery } from "../../graphql/queries/knowledge/entity.queries";

type MinimalPropertyValueValidationReport = {
  type: "valueValidation";
  data: ValueValidationError;
};

type MinimalPropertyArrayValidationReport = {
  type: "array";
  /**
   * The editor currently does not support arrays of property objects or 2D arrays,
   * so a single-value constraint violation is the only handled error.
   */
  items?: MinimalPropertyValueValidationReport;
};

type MissingPropertyValidationReport = {
  type: "missing";
};

type ObjectError = {
  type: "child-has-errors";
};

type PropertyValidationReportBase = {
  /**
   * The path to the property in the entity's properties.
   * There will be multiple if this is a path within a property object.
   *
   * It doesn't contain numbers (indices) in the path because we do not support arrays of property objects in the editor.
   */
  message: string;
  propertyPath: [BaseUrl, ...BaseUrl[]];
};

export type MinimalPropertyValidationReport = PropertyValidationReportBase &
  (
    | MissingPropertyValidationReport
    | MinimalPropertyArrayValidationReport
    | MinimalPropertyValueValidationReport
    | ObjectError
  );

export type MinimalEntityValidationReport = {
  errors: MinimalPropertyValidationReport[];
};

const generateArrayErrorMessage = (
  numItems: ArrayItemNumberMismatch,
): string => {
  if (numItems.type === "tooFew") {
    return `At least ${numItems.data.min} items required`;
  }
  return `No more than ${numItems.data.max} items allowed`;
};

const generatePropertyObjectValidationReports = (
  objectValidation: ObjectValidationReport,
  pathToObject: BaseUrl[] = [],
  reports: MinimalPropertyValidationReport[] = [],
): MinimalPropertyValidationReport[] => {
  if (!objectValidation.properties) {
    return [];
  }

  for (const [baseUrl, report] of typedEntries(objectValidation.properties)) {
    const propertyPath = mustHaveAtLeastOne([...pathToObject, baseUrl]);

    switch (report.type) {
      case "missing": {
        reports.push({
          propertyPath,
          type: "missing",
          message: "Property is required",
        });
        break;
      }
      case "propertyArray": {
        if (!report.numItems) {
          /**
           * @todo H-3790: Handle value constraint violations in array items
           */
          continue;
        }

        reports.push({
          propertyPath,
          type: "array",
          message: generateArrayErrorMessage(report.numItems),
        });
        break;
      }
      case "array": {
        const firstValidationError = report.validations?.[0];

        if (firstValidationError?.type !== "arrayValidation") {
          continue;
        }

        if (!firstValidationError.data.numItems) {
          /**
           * @todo H-3790: Handle value constraint violations in array items
           */
          continue;
        }

        reports.push({
          propertyPath,
          type: "array",
          message: generateArrayErrorMessage(
            firstValidationError.data.numItems,
          ),
        });
        break;
      }
      case "object": {
        if (report.validations?.[0]?.type !== "objectValidation") {
          continue;
        }

        const childErrors = generatePropertyObjectValidationReports(
          report.validations[0],
          propertyPath,
        );
        if (childErrors.length) {
          reports.push({
            propertyPath,
            type: "child-has-errors",
            message: "A property on this object has errors",
          });
          reports.push(...childErrors);
        }
        break;
      }
      default: {
        /**
         * @todo H-3790: Handle value constraint violations
         */
        throw new Error(`Unhandled report type ${report.type}`);
      }
    }
  }

  return reports;
};

/**
 * Generate a validation report that covers a few cases which are handled in the entity editor
 */
export const generateMinimalValidationReport = (
  validationReport: EntityValidationReport,
): MinimalEntityValidationReport | null => {
  if (!validationReport.properties) {
    return null;
  }

  const reports = generatePropertyObjectValidationReports(validationReport);

  return reports.length ? { errors: reports } : null;
};

export const useValidateEntity = () => {
  const [validate, { loading }] = useLazyQuery<
    ValidateEntityQuery,
    ValidateEntityQueryVariables
  >(validateEntityQuery, {
    fetchPolicy: "network-only",
  });

  const validateEntity = useCallback(
    async ({
      entityTypeIds,
      properties,
    }: {
      entityTypeIds: VersionedUrl[];
      properties: PropertyObjectWithMetadata;
    }) => {
      const { data, error } = await validate({
        variables: {
          components: {
            linkData: true,
            linkValidation: true,
            numItems: true,
            requiredProperties: true,
          },
          entityTypes: entityTypeIds,
          properties,
        },
      });

      if (!data) {
        throw new Error(
          error?.message ?? "No data returned from validation query",
        );
      }

      if (!data.validateEntity) {
        /**
         * No validation errors
         */
        return null;
      }

      return generateMinimalValidationReport(data.validateEntity);
    },
    [validate],
  );

  return {
    loading,
    validateEntity,
  };
};
