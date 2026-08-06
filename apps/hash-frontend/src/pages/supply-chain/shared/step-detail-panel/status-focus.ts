import { useEffect, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";

import type { StatusEntry } from "../status";

export const statusUpdateDomId = (entry: StatusEntry): string =>
  `status-update-${extractEntityUuidFromEntityId(entry.entityId)}`;

export const useStatusUpdateFocus = ({
  focusedStatusUpdateUuid,
  statusEntries,
}: {
  focusedStatusUpdateUuid?: string | null;
  statusEntries: readonly StatusEntry[];
}) => {
  const focusedStatusUpdateRef = useRef<HTMLDivElement>(null);
  const [highlightedStatusUpdateUuid, setHighlightedStatusUpdateUuid] =
    useState<string | null>(null);
  const statusEntryIds = statusEntries
    .map((statusEntry) => statusEntry.entityId)
    .join(",");

  useEffect(() => {
    if (!focusedStatusUpdateUuid) {
      setHighlightedStatusUpdateUuid(null);
      return;
    }

    setHighlightedStatusUpdateUuid(focusedStatusUpdateUuid);
    focusedStatusUpdateRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const timeout = window.setTimeout(
      () => setHighlightedStatusUpdateUuid(null),
      3_000,
    );

    return () => window.clearTimeout(timeout);
  }, [focusedStatusUpdateUuid, statusEntryIds]);

  return {
    focusedStatusUpdateRef,
    highlightedStatusUpdateUuid,
  };
};
