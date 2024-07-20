import { Box } from "@mui/material";

import { MarkdownDeliverable } from "./deliverables/markdown";
import type { DeliverableData } from "./deliverables/shared/types";
import { SpreadsheetDeliverable } from "./deliverables/spreadsheet";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";

export const Deliverables = ({
  deliverables,
}: {
  deliverables: DeliverableData[];
}) => {
  const hasDeliverables = deliverables.length > 0;

  return (
    <OutputContainer
      sx={{
        flex: 1,
        minWidth: 275,
      }}
    >
      {hasDeliverables ? (
        <Box sx={{ p: 3 }}>
          {deliverables.map((deliverable, index) => {
            return (
              // eslint-disable-next-line react/no-array-index-key
              <Box key={index} mb={2}>
                {deliverable.type === "markdown" ? (
                  <MarkdownDeliverable deliverable={deliverable} />
                ) : (
                  <SpreadsheetDeliverable deliverable={deliverable} />
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <EmptyOutputBox
          Icon={outputIcons.deliverables}
          label={"The outputs of this flow marked as deliverables will appear here when ready"}
        />
      )}
    </OutputContainer>
  );
};
