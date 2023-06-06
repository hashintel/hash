import { Button } from "@hashintel/design-system";
import { Box } from "@mui/material";

export const QueryEditorToggle = ({
  shouldShowQueryEditor,
  toggle,
}: {
  shouldShowQueryEditor: boolean;
  toggle: () => void;
}) => {
  return (
    <Box
      sx={{
        position: "absolute",
        zIndex: 100,
        left: 8,
        bottom: 8,
      }}
      onClick={toggle}
    >
      <Button variant="secondary">
        Use {shouldShowQueryEditor ? "entity editor" : "query editor"}
      </Button>
    </Box>
  );
};
