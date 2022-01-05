/**
 * The term Node is ambiguous which means we can't enforce the use of the Schema
 * generic argument via eslint. To work around that, I've disallowed the direct
 * import of Node from prosemirror-model and enforced the use of this
 * ProsemirrorNode alias via eslint which allows to then enforce the use of the
 * Schema generic argument.
 *
 * @todo look into using an extension of `prosemirror-model` for this
 */
// eslint-disable-next-line no-restricted-imports
export { Node as ProsemirrorNode } from "prosemirror-model";
