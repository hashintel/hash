import {
  validateVersionedUrl,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import { typedEntries, typedKeys } from "../shared/util/typed-object-iter.js";

/**
 * The input parameters of Codegen, prior to their validation.
 */
export type CodegenParameters = {
  /** Files, and the types to generate within them */
  outputFolder: string;
  targets: {
    [fileName: string]: [
      {
        sourceTypeId: VersionedUrl;
        /** Whether to generate helper types which mark this Entity Type as the Block Entity */
        blockEntity?: boolean;
      },
    ];
  };
  typeNameOverrides?: {
    [sourceTypeId: string]: string;
  };
  /**
   * Enables fetching the schema from a different URL to the one in its schema.
   * The return of this function will be used as the URL to fetch the type from,
   * but does NOT affect the type id in the generated schema.
   */
  getFetchUrlFromTypeId?: (typeId: VersionedUrl) => VersionedUrl;
  /** Generate look-up maps with aliases for all type URLs */
  typeIdAliases?:
    | { enabled: false }
    | {
        enabled: true;
        /** Override the generated name for certain aliases */
        overrides?: {
          [sourceTypeId: string]: string;
        };
      };
  /* @todo - Add support for generating Base URL aliases? */
  /* @todo - Make the resolve depth configurable */
  temporal?: boolean;
};

export const validateCodegenParameters = (
  parameters: unknown,
): { errors: string[] } | undefined => {
  const errors: string[] = [];

  if (typeof parameters !== "object" || parameters === null) {
    return { errors: ["Parameters must be an object"] };
  }

  const { outputFolder, targets, typeNameOverrides, typeIdAliases, temporal } =
    parameters as Record<string, unknown>;

  if (typeof outputFolder !== "string") {
    errors.push("`outputFolder` must be a string pointing to a directory");
  }

  if (
    !(
      typeof targets === "object" &&
      targets !== null &&
      !Array.isArray(targets)
    )
  ) {
    errors.push("`targets` must be an object");
  } else {
    for (const [fileName, targetsForFile] of Object.entries(targets)) {
      if (!Array.isArray(targetsForFile)) {
        errors.push(`file '${fileName}' in 'targets' must be an array`);
      } else {
        for (const target of targetsForFile as unknown[]) {
          if (typeof target !== "object" || target === null) {
            errors.push(
              `each entry under file '${fileName}' in 'targets' must be an object`,
            );
            continue;
          }
          if (!("sourceTypeId" in target)) {
            errors.push(
              `each entry under file '${fileName}' in 'targets' must have a 'sourceTypeId' property`,
            );
            continue;
          }

          if (
            !(
              "sourceTypeId" in target &&
              typeof target.sourceTypeId === "string"
            )
          ) {
            errors.push(
              `each entry under file '${fileName}' in 'targets' must have a 'sourceTypeId' string`,
            );
          } else if (validateVersionedUrl(target.sourceTypeId).type !== "Ok") {
            errors.push(
              `each entry under file '${fileName}' in 'targets' must have a valid 'sourceTypeId' property set to the Versioned URL of an entity type`,
            );
          }

          if (
            "blockEntity" in target &&
            target.blockEntity !== undefined &&
            typeof target.blockEntity !== "boolean"
          ) {
            errors.push(
              `if an entry under file '${fileName}' in 'targets' has a 'blockEntity' flag, it must be a boolean`,
            );
          }
        }
      }
    }
  }

  if (typeNameOverrides !== undefined) {
    if (
      !(typeof typeNameOverrides === "object" && typeNameOverrides !== null)
    ) {
      errors.push("`typeNameOverrides` must be an object");
    } else {
      for (const [typeId, typeNameOverride] of Object.entries(
        typeNameOverrides,
      )) {
        if (validateVersionedUrl(typeId).type !== "Ok") {
          errors.push(
            `each key in 'typeNameOverrides' must be a valid Versioned URL`,
          );
        }
        if (typeof typeNameOverride !== "string") {
          errors.push(
            `each entry in 'typeNameOverrides' must be a string, but '${typeId}' is a ${typeof typeNameOverride}`,
          );
        }
      }
    }
  }

  if (typeIdAliases !== undefined) {
    if (!(typeof typeIdAliases === "object" && typeIdAliases !== null)) {
      errors.push("`typeIdAliases` must be an object");
    } else if (
      !("enabled" in typeIdAliases) ||
      typeIdAliases.enabled === undefined
    ) {
      errors.push("`typeIdAliases.enabled` must be set");
    } else if (typeof typeIdAliases.enabled !== "boolean") {
      errors.push("`typeIdAliases.enabled` must be a boolean");
    } else if (typeIdAliases.enabled) {
      if (
        "overrides" in typeIdAliases &&
        typeIdAliases.overrides !== undefined
      ) {
        if (
          !(
            typeof typeIdAliases.overrides === "object" &&
            typeIdAliases.overrides !== null
          )
        ) {
          errors.push("`typeIdAliases.overrides` must be an object");
        } else {
          for (const [versionedUrl, alias] of Object.entries(
            typeIdAliases.overrides,
          )) {
            if (validateVersionedUrl(versionedUrl).type !== "Ok") {
              errors.push(
                `each key in 'typeIdAliases.overrides' must be a valid Versioned URL`,
              );
            }
            if (typeof alias !== "string") {
              errors.push(
                `each entry in 'typeIdAliases.overrides' must be a string, but '${versionedUrl}' is a ${typeof alias}`,
              );
            }
          }
        }
      }
    }
  }

  if (temporal !== undefined && typeof temporal !== "boolean") {
    errors.push("`temporal` must be a boolean");
  }

  if (errors.length > 0) {
    return { errors };
  }
};

export type ProcessedCodegenParameters = Omit<
  Required<CodegenParameters>,
  "targets" | "getFetchUrlFromTypeId"
> & {
  getFetchUrlFromTypeId: CodegenParameters["getFetchUrlFromTypeId"];
  targets: {
    [fileName: string]: {
      sourceTypeIds: VersionedUrl[];
      blockEntity?: VersionedUrl;
    };
  };
};

export const processCodegenParameters = (
  parameters: CodegenParameters,
): ProcessedCodegenParameters => {
  const blockEntityTypeClashes: Record<string, VersionedUrl[]> = {};

  const targets = Object.fromEntries(
    typedEntries(parameters.targets).map(([fileName, targetsForFile]) => {
      const blockEntityTargets = [];
      const sourceTypeIds: VersionedUrl[] = [];

      for (const target of targetsForFile) {
        if (target.blockEntity) {
          blockEntityTargets.push(target);
        }

        sourceTypeIds.push(target.sourceTypeId);
      }

      if (blockEntityTargets.length > 1) {
        blockEntityTypeClashes[fileName] = blockEntityTargets.map(
          (target) => target.sourceTypeId,
        );
      }

      const blockEntity = blockEntityTargets[0]?.sourceTypeId;

      return [fileName, { sourceTypeIds, blockEntity }];
    }),
  );

  if (typedKeys(blockEntityTypeClashes).length > 0) {
    throw new Error(
      `Each file can express a maximum of one block entity type. The following files have multiple block entity types defined: ${JSON.stringify(
        blockEntityTypeClashes,
        null,
        2,
      )}`,
    );
  }

  return {
    ...parameters,
    getFetchUrlFromTypeId: parameters.getFetchUrlFromTypeId,
    targets,
    typeIdAliases: parameters.typeIdAliases ?? { enabled: true },
    typeNameOverrides: parameters.typeNameOverrides ?? {},
    temporal: parameters.temporal ?? false,
  };
};
