/**
 * Default blocks loaded for every user.
 *
 * @todo allow users to configure their own default block list, and store in db.
 *    this should be a list of additions and removals from this default list,
 *    to allow us to add new default blocks that show up for all users.
 *    we currently store this in localStorage - see UserBlockProvider.
 */
export const defaultBlocks = [
  "https://blockprotocol.org/blocks/@hash/paragraph",
  "https://blockprotocol.org/blocks/@hash/header",
  "https://blockprotocol.org/blocks/@hash/callout",
  "https://blockprotocol.org/blocks/@hash/person",
  "https://blockprotocol.org/blocks/@hash/image",
  "https://blockprotocol.org/blocks/@hash/table",
  "https://blockprotocol.org/blocks/@hash/divider",
  "https://blockprotocol.org/blocks/@hash/embed",
  "https://blockprotocol.org/blocks/@hash/code",
  "https://blockprotocol.org/blocks/@hash/video",
];
