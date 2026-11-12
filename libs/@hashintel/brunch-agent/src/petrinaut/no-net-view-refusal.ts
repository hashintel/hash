/** Why a change with no current view of the net in context was not started, naming the reads that give one. */
export const noNetViewRefusalNaming = (reads: string) =>
  `Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (${reads}), then make the change.`;
