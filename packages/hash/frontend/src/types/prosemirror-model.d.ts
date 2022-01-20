// eslint-disable-next-line no-restricted-imports
import { Node, Schema } from "prosemirror-model";

declare module "prosemirror-model" {
  /**
   * The official typescript types for prosemirror don't yet understand that
   * `textBetween` supports a function for `leafText`
   *
   * @see https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/57769
   * @todo remove this when the types are updated
   */
  export interface Fragment<S extends Schema = any> {
    textBetween(
      from: number,
      to: number,
      blockSeparator?: string | null,
      leafText?: string | null | ((leafNode: Node<S>) => string | null),
    ): string;
  }
}
