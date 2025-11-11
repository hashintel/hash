/**
 * @todo-0.3 replace this temporary domain with blockprotocol.org
 */
export const blockProtocolHubOrigin =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want empty strings either
  process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_SITE_HOST ||
  "https://blockprotocol.org";

/**
 * the componentId is the location of the block source code, which will be in one of two R2 buckets depending on environment
 * @todo use a componentId which isn't tied to source location in this way, e.g. based on the BP Hub host
 *   – this will also be required for block versioning, where we'll want different source locations for the same componentId
 */
export const componentIdBase = `https://blockprotocol${
  !blockProtocolHubOrigin.includes("blockprotocol.org") ? "-preview" : ""
}.hashai.workers.dev`;

export const paragraphBlockComponentId = `${componentIdBase}/blocks/hash/paragraph`;

const richTextBlockComponentIds = new Set([
  paragraphBlockComponentId,
  `${componentIdBase}/blocks/hash/heading`,
  `${componentIdBase}/blocks/hash/callout`,
]);

const componentIdsWithTextualContentProperty = new Set([
  ...Array.from(richTextBlockComponentIds),
  `${componentIdBase}/blocks/hash/code`,
]);

/**
 * Default blocks loaded for every user.
 *
 * @todo allow users to configure their own default block list, and store in db.
 *    this should be a list of additions and removals from this default list,
 *    to allow us to add new default blocks that show up for all users.
 *    we currently store this in localStorage - see UserBlocksProvider.
 */
export const defaultBlockComponentIds = [
  ...Array.from(richTextBlockComponentIds),
  `${componentIdBase}/blocks/hash/person`,
  `${componentIdBase}/blocks/hash/image`,
  `${componentIdBase}/blocks/hash/table`,
  `${componentIdBase}/blocks/hash/embed`,
  `${componentIdBase}/blocks/hash/code`,
  `${componentIdBase}/blocks/hash/video`,
];

/**
 * This is used to work out if the block is one of our hardcoded text blocks,
 * which is used to know if the block is compatible for switching from one
 * text block to another
 */
export const isHashTextBlock = (componentId: string) =>
  richTextBlockComponentIds.has(componentId);

export const isBlockWithTextualContentProperty = (componentId: string) =>
  componentIdsWithTextualContentProperty.has(componentId);

/**
 * In some places, we need to know if the current component and a target
 * component we're trying to switch to are compatible, in order to know whether
 * to share existing properties or whether to enabling switching. This does that
 * by checking IDs are the same (i.e, they're variants of the same block) or
 * if we've hardcoded support for switching (i.e, they're HASH text blocks)
 */
export const areComponentsCompatible = (
  currentComponentId: string | null = null,
  targetComponentId: string | null = null,
) =>
  currentComponentId &&
  targetComponentId &&
  (currentComponentId === targetComponentId ||
    (isBlockWithTextualContentProperty(currentComponentId) &&
      isBlockWithTextualContentProperty(targetComponentId)));
