// The following import order prevents dependency cycles from occurring.
// The name of these default imports define the name of the model classes
// when accessed from outside of this module.

// import File from "./file.model";
import Aggregation from "./aggregation.model";

/** @todo: deprecate legacy model classes */

export * from "./aggregation.model";
export { Aggregation };

// export * from "./file.model";
// export { File };
