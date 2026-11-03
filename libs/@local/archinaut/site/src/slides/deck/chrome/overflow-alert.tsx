/** The error a slide shows, while overflow is flagged, when its content does not fit. */

export const OverflowAlert = ({ overflow }: { overflow: number }) =>
  overflow === 0 ? null : (
    <p className="deck-overflow-alert" role="status">
      This slide overflows by {overflow} px
    </p>
  );
