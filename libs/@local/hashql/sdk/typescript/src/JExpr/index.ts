/**
 * Identifiers, paths and type syntax for HashQL.
 *
 * {@link Ident} decodes and prints single identifiers. {@link Path} and {@link Type} model mutually recursive paths and type syntax. Name resolution and type checking belong to the HashQL compiler.
 *
 * @module
 */
export * as Ident from "./Ident.js";
export type * as ParserError from "./ParserError.js";
export * as Path from "./Path.js";
export * as Type from "./Type/index.js";
