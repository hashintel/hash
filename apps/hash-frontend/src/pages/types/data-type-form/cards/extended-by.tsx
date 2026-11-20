import { Box } from "@mui/material";

import { Button } from "@hashintel/ds-components";

import { DataTypeCard, SectionCard } from "./data-type-card";

import type { ReactNode } from "react";

/**
 * The types extending this one — reference information rather than part of
 * the type's own definition, so it sits last and starts collapsed. The
 * members input is built by the form (shared with the group members card)
 * and passed as children.
 */
export const ExtendedByCard = ({
  childEntryCount,
  expanded,
  onToggleExpanded,
  action,
  error,
  children,
}: {
  childEntryCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** The "Add another type" picker toggle, shown while expanded */
  action?: ReactNode;
  error?: string;
  children: ReactNode;
}) => (
  <SectionCard>
    <Box sx={{ padding: "16px 18px 18px" }}>
      <DataTypeCard
        label="Extended by"
        description={
          expanded
            ? "These types extend this type, inheriting its constraints."
            : `${childEntryCount} ${childEntryCount === 1 ? "type extends" : "types extend"} this type.`
        }
        actions={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {expanded ? action : null}
            <Button
              variant="ghost"
              size="xs"
              iconName={expanded ? "chevronDown" : "chevronRight"}
              tooltip={
                expanded
                  ? "Hide the extending types"
                  : "Show the extending types"
              }
              onClick={onToggleExpanded}
            />
          </Box>
        }
        errors={error ? [error] : undefined}
      >
        {expanded ? children : null}
      </DataTypeCard>
    </Box>
  </SectionCard>
);
