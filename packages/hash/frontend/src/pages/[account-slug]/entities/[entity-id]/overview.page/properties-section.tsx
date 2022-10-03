import { Chip } from "@hashintel/hash-design-system/chip";
import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from "@mui/material";
import { EntitySection } from "../shared/entity-section";

const properties: { name: string; value: string }[] = [
  { name: "Headcount", value: "221,000" },
  { name: "Founding date", value: "4 April 1975" },
  { name: "Product screenshots", value: "3 file attachments" },
  {
    name: "Competitive advantages",
    value: "Incumbency, Economies of scale, Respectable CEO",
  },
  { name: "Estimates user base", value: "527,404" },
  { name: "Estimated annual revenue", value: "$198.27 billion USD" },
  { name: "Estimated annual gross profit", value: "$96.937 billion USD" },
];

export const PropertiesSection = () => {
  return (
    <EntitySection
      title="Properties"
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label="8 Values" />
          <Chip
            size="xs"
            label="112 empty"
            variant="outlined"
            sx={{
              background: "white",
              borderColor: ({ palette }) => palette.gray[30],
            }}
          />
        </Stack>
      }
    >
      <TableContainer component={Paper}>
        <Table
          sx={{
            minWidth: 650,
          }}
        >
          <TableHead>
            <TableRow
              sx={({ palette }) => ({
                th: {
                  borderRight: 1,
                  borderColor: palette.gray[20],
                },
                "& th:last-of-type": { borderRight: 0 },
              })}
            >
              <TableCell>
                <TableSortLabel>Property</TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel>Value</TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel>Data type</TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => (
              <TableRow
                key={property.name}
                sx={{
                  td: {
                    border: 0,
                    borderRight: 1,
                    borderColor: ({ palette }) => palette.gray[20],
                  },
                  "& td:last-of-type": { borderRight: 0 },
                }}
              >
                <TableCell>{property.name}</TableCell>
                <TableCell align="left">{property.value}</TableCell>
                <TableCell align="left">Number</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </EntitySection>
  );
};
