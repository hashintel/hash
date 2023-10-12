import { Box, styled, Typography } from "@mui/material";

const Command = styled(Box)(({ theme }) => ({
  color: theme.palette.gray[50],
  borderRadius: 3,
  background: theme.palette.gray[10],
  width: "1.875em",
  height: "1.875em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Container = styled(Typography)(({ theme }) => ({
  position: "absolute",
  display: "flex",
  color: theme.palette.gray[60],
  left: 0,
  top: 0,
}));

export const Placeholder = () => {
  return (
    <Container variant="regularTextPages">
      Type <Command>/</Command> to browse blocks, or <Command>@</Command> to
      browse entities
    </Container>
  );
};
