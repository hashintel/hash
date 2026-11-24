/** The error a slide shows, while overflow is flagged, when its content does not fit. */

import { WarningIcon } from "@hashintel/ds-icons";

export const OverflowAlert = ({ overflow }: { overflow: number }) =>
  overflow === 0 ? null : (
    <p className="deck-overflow-alert" role="status">
      <WarningIcon size={14} />
      This slide overflows by {overflow} px
    </p>
  );
