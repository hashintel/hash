import { useReadOnlyReason } from "./use-read-only-reason";

/**
 * Hook that determines if the editor is in read-only mode.
 *
 * The editor is read-only when any of the following are true:
 * 1. The external `readonly` prop is set by the consumer
 * 2. The global mode is "simulate" (user has switched to simulation mode)
 * 3. A simulation is currently running, paused, or complete
 *
 * For a structured refusal reason (e.g. for AI tool feedback), use
 * {@link useReadOnlyReason} directly.
 */
export const useIsReadOnly = (): boolean => useReadOnlyReason() !== null;
