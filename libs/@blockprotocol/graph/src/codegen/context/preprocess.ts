import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { ProcessedCodegenParameters } from "../parameters";
import type { LogLevel } from "../shared";
import type { InitializeContext } from "./initialize";
import type { TypeDependencyMap } from "./shared";
import { JSONSchema } from "json-schema-to-typescript";

export class PreprocessContext {
  readonly parameters: ProcessedCodegenParameters;
  readonly logLevel: LogLevel;

  readonly dataTypes: Record<VersionedUrl, DataType>;
  readonly propertyTypes: Record<VersionedUrl, PropertyType>;
  readonly entityTypes: Record<VersionedUrl, EntityType>;
  readonly metadataSchemas: Record<string, JSONSchema>;
  readonly allTypes: Record<
    string,
    DataType | PropertyType | EntityType | JSONSchema
  >;

  readonly typeDependencyMap: TypeDependencyMap;

  /** Map of entity type IDs to whether or not they are link entity types */
  linkTypeMap: Record<keyof typeof this.entityTypes, boolean> = {};

  constructor(initialContext: InitializeContext) {
    this.parameters = initialContext.parameters;
    this.logLevel = initialContext.logLevel;
    this.dataTypes = initialContext.dataTypes;
    this.propertyTypes = initialContext.propertyTypes;
    this.entityTypes = initialContext.entityTypes;
    this.metadataSchemas = initialContext.metadataSchemas;
    this.typeDependencyMap = initialContext.typeDependencyMap;

    this.allTypes = {
      ...this.dataTypes,
      ...this.propertyTypes,
      ...this.entityTypes,
      ...this.metadataSchemas,
    };
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
}
