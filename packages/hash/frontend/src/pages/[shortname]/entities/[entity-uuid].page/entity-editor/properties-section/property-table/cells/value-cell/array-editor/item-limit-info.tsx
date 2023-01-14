import { Button } from "@local/hash-design-system";
import { Box, experimental_sx as sx, styled } from "@mui/material";
import { isNumber } from "lodash";

const StyledBox = styled(Box)(
  sx({
    borderRadius: 1,
    mr: 0.5,
    backgroundColor: "gray.20",
    height: 26,
    display: "flex",
    alignItems: "center",
    px: 1,
    color: "gray.60",
  }),
);

export const ItemLimitInfo = ({ min, max }: { min?: number; max?: number }) => {
  const minNode = isNumber(min) ? (
    <>
      <StyledBox>{min}</StyledBox> values required
    </>
  ) : null;

  const maxNode = isNumber(max) ? (
    <>
      {isNumber(min) && <Box mx={0.5}>{" and "}</Box>}
      <StyledBox>{max}</StyledBox> values maximum
    </>
  ) : null;

  const nodesToRender =
    minNode || maxNode ? (
      <>
        {minNode}
        {maxNode}
      </>
    ) : null;

  if (!nodesToRender) {
    return null;
  }

  return (
    <Button
      disabled
      size="small"
      variant="tertiary_quiet"
      fullWidth
      sx={{
        justifyContent: "flex-start",
        borderRadius: 0,
        background: ({ palette }) => `${palette.gray[10]} !important`,
        fontSize: 12,
      }}
    >
      {nodesToRender}
    </Button>
  );
};
