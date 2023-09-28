import { Box, Typography } from "@mui/material";

const DocsPage = ({ params }: { params: { slug: string } }) => {
  const { slug } = params;

  return (
    <Box>
      <Typography variant="h1">{slug}</Typography>
    </Box>
  );
};

export default DocsPage;
