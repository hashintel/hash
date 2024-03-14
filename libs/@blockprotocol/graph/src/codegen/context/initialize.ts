import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type {
  CodegenParameters,
  ProcessedCodegenParameters,
} from "../parameters.js";
import { processCodegenParameters } from "../parameters.js";
import type { LogLevel } from "../shared.js";
import { TypeDependencyMap } from "./shared.js";

export class InitializeContext {
  readonly parameters: ProcessedCodegenParameters;
  readonly logLevel: LogLevel;

  dataTypes: Record<VersionedUrl, DataType> = {};
  propertyTypes: Record<VersionedUrl, PropertyType> = {};
  entityTypes: Record<VersionedUrl, EntityType> = {};

  typeDependencyMap: TypeDependencyMap = new TypeDependencyMap();

  constructor(parameters: CodegenParameters, verbose: LogLevel) {
    this.parameters = processCodegenParameters(parameters);

    this.logLevel = verbose;
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

  addDataType = (dataType: DataType) => {
    this.dataTypes[dataType.$id] = dataType;
  };

  addPropertyType = (propertyType: PropertyType) => {
    this.propertyTypes[propertyType.$id] = propertyType;
  };

  addEntityType = (entityType: EntityType) => {
    this.entityTypes[entityType.$id] = entityType;
  };
}
