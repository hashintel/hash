import {
  faAsterisk,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
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
import { FilterListIcon } from "../../../../shared/icons";
import { EntitySection } from "./shared/entity-section";
import { WhiteChip } from "./shared/white-chip";

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
          <WhiteChip size="xs" label="112 empty" />
          <Stack direction="row" spacing={0.5}>
            <IconButton
              rounded
              onClick={() => alert("search")}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </IconButton>
            <IconButton
              rounded
              onClick={() => alert("filter")}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FilterListIcon />
            </IconButton>
          </Stack>
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
                <TableCell align="left">
                  <Chip
                    icon={<FontAwesomeIcon icon={faAsterisk} />}
                    label="Number"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </EntitySection>
  );
};
