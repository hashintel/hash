import { Button } from "../../../../../../../../../shared/ui";

export const MaxItemsReached = ({ limit }: { limit: number }) => {
  return (
    <Button
      disabled
      size="small"
      variant="tertiary_quiet"
      fullWidth
      sx={{ justifyContent: "flex-start", borderRadius: 0 }}
    >
      Max Items ({limit}) Reached
    </Button>
  );
};
