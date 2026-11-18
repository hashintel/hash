import { useAgentStart, usePersistentState } from "@flue/runtime";

/**
 * The conversation's preferred spellings. A user delivery's snapshot applies
 * from its first render and is kept when the agent starts, so a later signal
 * delivery, which carries none, keeps the last admitted snapshot. A user
 * delivery without words clears it.
 *
 * @param incoming The current user delivery's snapshot, or `undefined` for a
 *   signal delivery.
 */
export const useWords = (
  incoming: readonly string[] | undefined,
): readonly string[] => {
  const [persisted, setPersisted] = usePersistentState<readonly string[]>(
    "brunch.words.v1",
    [],
  );
  useAgentStart(() => {
    if (
      incoming !== undefined &&
      JSON.stringify(incoming) !== JSON.stringify(persisted)
    )
      setPersisted([...incoming]);
  });
  return incoming ?? persisted;
};
