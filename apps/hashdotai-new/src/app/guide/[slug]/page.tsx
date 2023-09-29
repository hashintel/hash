import { Box, Typography } from "@mui/material";

const GuidePage = ({ params }: { params: { slug: string } }) => {
  const { slug } = params;

  return (
    <Box>
      <Typography variant="h1">{slug}</Typography>
    </Box>
  );
};

export default GuidePage;
