import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { ProcessedCodegenParameters } from "../parameters.js";
import type { CompiledTsType, LogLevel } from "../shared.js";
import type { PreprocessContext } from "./preprocess.js";
import type { TypeDependencyMap } from "./shared.js";

export class CompileContext {
  readonly parameters: ProcessedCodegenParameters;
  readonly logLevel: LogLevel;

  readonly dataTypes: Record<VersionedUrl, DataType>;
  readonly propertyTypes: Record<VersionedUrl, PropertyType>;
  readonly entityTypes: Record<VersionedUrl, EntityType>;
  readonly allTypes: Record<VersionedUrl, DataType | PropertyType | EntityType>;

  readonly typeDependencyMap: TypeDependencyMap;

  /** Map of entity type IDs to whether or not they are link entity types */
  readonly linkTypeMap: Record<keyof typeof this.entityTypes, boolean>;

  /** Map of type IDs to their compiled schemas */
  typeIdsToCompiledTypes: Record<keyof typeof this.allTypes, CompiledTsType> =
    {};

  constructor(preprocessContext: PreprocessContext) {
    this.parameters = preprocessContext.parameters;
    this.logLevel = preprocessContext.logLevel;
    this.dataTypes = preprocessContext.dataTypes;
    this.propertyTypes = preprocessContext.propertyTypes;
    this.entityTypes = preprocessContext.entityTypes;
    this.allTypes = preprocessContext.allTypes;
    this.typeDependencyMap = preprocessContext.typeDependencyMap;
    this.linkTypeMap = preprocessContext.linkTypeMap;
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

  addCompiledTsType(
    typeId: keyof typeof this.allTypes,
    compiledTsType: CompiledTsType,
  ) {
    this.typeIdsToCompiledTypes[typeId] = compiledTsType;
  }
}
