import {
  summaryAction,
  summaryCount,
  summaryRow,
} from "./selectable-list-selection-summary.recipe";

/**
 * A selection summary for the footer (or header) of a SelectableList
 * (`footer={<SelectableListSelectionSummary ... />}`). Unless hidden via
 * `hideCount`, an "x of y" selected count renders on the left; unless hidden
 * via `hideSelectAllToggle`, a "Select all" / "Clear all" toggle renders on
 * the right (which of the two depends on whether `selectedCount` covers
 * `totalCount`). Both need the counts — what they mean (e.g. whether they
 * follow a search filter) is the consumer's call.
 */
export const SelectableListSelectionSummary = ({
  hideCount = false,
  hideSelectAllToggle = false,
  selectedCount,
  totalCount,
  onSelectAll,
  onClearAll,
}: {
  hideCount?: boolean;
  hideSelectAllToggle?: boolean;
  selectedCount: number;
  totalCount: number;
  onSelectAll?: () => void;
  onClearAll?: () => void;
}) => {
  if (hideCount && hideSelectAllToggle) {
    return null;
  }
  const allSelected = totalCount > 0 && selectedCount >= totalCount;

  return (
    <div className={summaryRow()}>
      {!hideCount && (
        <span className={summaryCount()}>
          {selectedCount} of {totalCount}
        </span>
      )}
      {!hideSelectAllToggle && (
        <button
          type="button"
          className={summaryAction()}
          onClick={() => (allSelected ? onClearAll : onSelectAll)?.()}
          onKeyDown={(event) => {
            // Keep activation keys on the button — in a Select the header/
            // footer row passes Enter through to zag, which would also act on
            // the highlighted item
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      )}
    </div>
  );
};
