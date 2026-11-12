import { Box } from "@mui/material";

import { DataTypeCard, SectionCard } from "./data-type-card";

import type { ReactNode } from "react";

/**
 * A group's members card — the child entries whose types make up the group.
 * The members input itself is built by the form (it is shared with the
 * Extended by card) and passed as children.
 */
export const GroupMembersCard = ({
  action,
  error,
  children,
}: {
  /** The "Add a type" picker toggle */
  action?: ReactNode;
  error?: string;
  children: ReactNode;
}) => (
  <SectionCard>
    <Box sx={{ padding: "16px 18px 18px" }}>
      <DataTypeCard
        label="Group members"
        actions={action}
        errors={error ? [error] : undefined}
      >
        {children}
      </DataTypeCard>
    </Box>
  </SectionCard>
);
