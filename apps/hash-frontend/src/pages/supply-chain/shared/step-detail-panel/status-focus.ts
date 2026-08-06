import { useEffect, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";

import type { StatusEntry } from "../status";

export const statusUpdateDomId = (entry: StatusEntry): string =>
  `status-update-${extractEntityUuidFromEntityId(entry.entityId)}`;

export const useStatusUpdateFocus = ({
  focusedStatusUpdateUuid,
  statusSectionReady = true,
  statusEntries,
}: {
  focusedStatusUpdateUuid?: string | null;
  statusSectionReady?: boolean;
  statusEntries: readonly StatusEntry[];
}) => {
  const statusSectionRef = useRef<HTMLDivElement>(null);
  const focusedStatusUpdateRef = useRef<HTMLDivElement>(null);
  const [highlightedStatusUpdateUuid, setHighlightedStatusUpdateUuid] =
    useState<string | null>(null);
  const statusEntryIds = statusEntries
    .map((statusEntry) => statusEntry.entityId)
    .join(",");

  useEffect(() => {
    if (!focusedStatusUpdateUuid || !statusSectionReady) {
      setHighlightedStatusUpdateUuid(null);
      return;
    }

    setHighlightedStatusUpdateUuid(focusedStatusUpdateUuid);
    (
      focusedStatusUpdateRef.current ?? statusSectionRef.current
    )?.scrollIntoView({
      behavior: "smooth",
      block: focusedStatusUpdateRef.current ? "center" : "start",
    });
    const timeout = window.setTimeout(
      () => setHighlightedStatusUpdateUuid(null),
      3_000,
    );

    return () => window.clearTimeout(timeout);
  }, [focusedStatusUpdateUuid, statusEntryIds, statusSectionReady]);

  return {
    focusedStatusUpdateRef,
    highlightedStatusUpdateUuid,
    statusSectionRef,
  };
};
