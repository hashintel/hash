/** Where a call stands at the approval gate; `null` from `approvalState` means it is past it. */
export type ToolApprovalState = "awaiting" | "refused";
