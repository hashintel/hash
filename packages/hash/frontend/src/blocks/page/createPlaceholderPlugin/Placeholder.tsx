import { styled, Typography } from "@mui/material";

const Command = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[60],
  borderRadius: 3,
  background: theme.palette.gray[10],
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Container = styled(Typography)(({ theme }) => ({
  position: "absolute",
  display: "flex",
  color: theme.palette.gray[60],
  lineHeight: "27px",
}));

export const Placeholder = () => {
  return (
    <Container>
      Type <Command>/</Command> to browse blocks, or <Command>@</Command> to
      browse entities
    </Container>
  );
};
