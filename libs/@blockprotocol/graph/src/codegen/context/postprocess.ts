import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { ProcessedCodegenParameters } from "../parameters.js";
import type {
  CompiledTsType,
  IdentifierForExternalImport,
  JsonSchema,
  LogLevel,
} from "../shared.js";
import type { CompileContext } from "./compile.js";
import type { TypeDependencyMap } from "./shared.js";

type IdentifierSource = { definingPath: string } & (
  | {
      kind: "external";
    }
  | {
      kind: "local";
      compiledContents: string;
      dependentOnIdentifiers: string[];
    }
);

/**
 * Defines the source, or sources, associated with a given identifier.
 *
 * Duplicate identifiers can exist when they're defined but not importable during codegen.
 */
export type IdentifierSources =
  | { locallyImportable: true; source: IdentifierSource }
  | { locallyImportable: false; source: IdentifierSource[] };

const externalIdentifiersToSource: Record<
  IdentifierForExternalImport,
  IdentifierSources
> = {
  Entity: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-sdk/entity",
    },
  },
  LinkEntity: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-sdk/entity",
    },
  },
  Confidence: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-types/entity",
    },
  },
  ObjectMetadata: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-client",
    },
  },
  ArrayMetadata: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-client",
    },
  },
  PropertyProvenance: {
    locallyImportable: true,
    source: {
      kind: "external",
      definingPath: "@local/hash-graph-client",
    },
  },
};

export class PostprocessContext {
  readonly parameters: ProcessedCodegenParameters;
  readonly logLevel: LogLevel;

  readonly dataTypes: Record<VersionedUrl, DataType>;
  readonly propertyTypes: Record<VersionedUrl, PropertyType>;
  readonly entityTypes: Record<VersionedUrl, EntityType>;
  readonly metadataSchemas: Record<VersionedUrl, JsonSchema>;
  readonly allTypes: Record<
    VersionedUrl,
    DataType | PropertyType | EntityType | JsonSchema
  >;

  readonly typeDependencyMap: TypeDependencyMap;

  /** Map of entity type IDs to whether or not they are link entity types */
  readonly linkTypeMap: Record<keyof typeof this.entityTypes, boolean>;

  /** Map of sourceTypeIds to their compiled schemas */
  readonly typeIdsToCompiledTypes: Record<
    keyof typeof this.allTypes,
    CompiledTsType
  >;

  /**
   * Map of TypeScript identifiers, to their source (the file that exports them) and the contents required to define
   * them if they're a locally defined type
   */
  IdentifiersToSources: Record<string, IdentifierSources>;

  /** Map of files to the identifiers of types that they will **depend on**, either by defining or importing them */
  filesToDependentIdentifiers: Record<string, Set<string>> = {};

  /** Map of files to the identifiers of types that they will **define** */
  filesToDefinedIdentifiers: Record<string, Set<string>> = {};

  /** Map of files to the actual TypeScript contents */
  filesToContents: Record<string, string> = {};

  constructor(compileContext: CompileContext) {
    this.parameters = compileContext.parameters;
    this.logLevel = compileContext.logLevel;
    this.dataTypes = compileContext.dataTypes;
    this.propertyTypes = compileContext.propertyTypes;
    this.entityTypes = compileContext.entityTypes;
    this.metadataSchemas = compileContext.metadataSchemas;
    this.allTypes = compileContext.allTypes;
    this.typeDependencyMap = compileContext.typeDependencyMap;
    this.linkTypeMap = compileContext.linkTypeMap;
    this.typeIdsToCompiledTypes = compileContext.typeIdsToCompiledTypes;

    this.IdentifiersToSources = externalIdentifiersToSource;
  }

  /* @todo - Replace this with a proper logging implementation */
  logWarn(message: string) {
    if (this.logLevel !== "silent") {
      // eslint-disable-next-line no-console
      console.warn(`WARN: ${message}`);
    }
  }

  logInfo(message: string) {
    if (
      this.logLevel === "info" ||
      this.logLevel === "debug" ||
      this.logLevel === "trace"
    ) {
      // eslint-disable-next-line no-console
      console.log(`INFO: ${message}`);
    }
  }

  logDebug(message: string) {
    if (this.logLevel === "debug" || this.logLevel === "trace") {
      // eslint-disable-next-line no-console
      console.log(`DEBUG: ${message}`);
    }
  }

  logTrace(message: string) {
    if (this.logLevel === "trace") {
      // eslint-disable-next-line no-console
      console.log(`TRACE: ${message}`);
    }
  }

  addDependentIdentifierInFile(identifier: string, path: string): void {
    this.filesToDependentIdentifiers[path] ??= new Set();
    this.filesToDependentIdentifiers[path].add(identifier);
  }

  defineIdentifierInFile(
    identifier: string,
    {
      definingPath,
      compiledContents,
      dependentOnIdentifiers,
    }: {
      definingPath: string;
      compiledContents: string;
      dependentOnIdentifiers: string[];
    },
    locallyImportable: boolean,
  ) {
    this.filesToDefinedIdentifiers[definingPath] ??= new Set();
    this.filesToDefinedIdentifiers[definingPath].add(identifier);

    this.filesToDependentIdentifiers[definingPath] ??= new Set();
    this.filesToDependentIdentifiers[definingPath].add(identifier);
    for (const dependentIdentifier of dependentOnIdentifiers) {
      this.filesToDependentIdentifiers[definingPath].add(dependentIdentifier);
    }

    const source = {
      kind: "local" as const,
      definingPath,
      compiledContents,
      dependentOnIdentifiers,
    };
    const existingMap = this.IdentifiersToSources[identifier];

    if (!existingMap) {
      this.IdentifiersToSources[identifier] = locallyImportable
        ? { locallyImportable, source }
        : { locallyImportable, source: [source] };
      return;
    }

    if (locallyImportable) {
      if (!existingMap.locallyImportable) {
        throw new Error(
          `Internal error: ambiguous source definitions for identifier '${identifier}', where it's locally defined in \
          ${definingPath} but also exported from \
          ${existingMap.source
            .map((existingSource) => existingSource.definingPath)
            .join(", ")}}`,
        );
      }

      // locallyImportable && existingMap.locallyImportable
      if (existingMap.source.definingPath !== definingPath) {
        throw new Error(
          `Internal error: identifier was marked as being defined in multiple files: ["${definingPath}", "${existingMap.source.definingPath}"]`,
        );
      }
    }

    // !locallyImportable
    if (existingMap.locallyImportable) {
      throw new Error(
        `Internal error: ambiguous source definitions for identifier '${identifier}', where it's exported from ${definingPath} but also locally defined in ${existingMap.source.definingPath}`,
      );
    }

    // !locallyImportable && !existingMap.locallyImportable, we can safely have conflicting definitions
    existingMap.source.push(source);
  }
}
