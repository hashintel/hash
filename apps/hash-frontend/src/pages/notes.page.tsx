import { Chip } from "@hashintel/design-system";
import { Box, Container, Divider, Typography } from "@mui/material";
import { styled } from "@mui/system";
import {
  differenceInDays,
  differenceInMonths,
  differenceInWeeks,
  format,
  isThisWeek,
  isThisYear,
  isToday,
  isYesterday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { FunctionComponent, useMemo } from "react";

import { QuickNoteIcon } from "../shared/icons/quick-note-icon";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { CreateQuickNote } from "./notes.page/create-quick-note";
import { TopContextBar } from "./shared/top-context-bar";

const CreateChip = styled(Chip)(({ theme }) => ({
  background: theme.palette.common.white,
  color: theme.palette.common.black,
  "&:hover": {
    color: theme.palette.common.black,
  },
}));

const timestampColumnWidth = 150;

const isLastWeek = (date: Date) => {
  const startOfThisWeek = startOfWeek(new Date());
  const startOfLastWeek = subWeeks(startOfThisWeek, 1);
  return date >= startOfLastWeek && date < startOfThisWeek;
};

const TimestampCollectionHeading: FunctionComponent<{ date: Date }> = ({
  date,
}) => {
  const heading = useMemo(() => {
    const today = new Date();

    if (isToday(date)) {
      return "Today";
    }
    if (isYesterday(date)) {
      return "Yesterday";
    }
    if (isThisWeek(date)) {
      return format(date, "EEEE");
    } // EEEE is the format string for day of the week
    if (isLastWeek(date)) {
      return `Last ${format(date, "EEEE")}`;
    }
    if (differenceInDays(today, date) <= 14) {
      return "More than a week ago";
    }
    if (differenceInWeeks(today, date) <= 4) {
      return "More than 2 weeks ago";
    }
    if (differenceInMonths(today, date) <= 12) {
      return "More than a month ago";
    }
    if (!isThisYear(date)) {
      return "More than a year ago";
    }

    return "Date not recognized";
  }, [date]);

  return (
    <Typography
      sx={{
        color: ({ palette }) => palette.gray[90],
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      {heading}
    </Typography>
  );
};

const TimestampCollectionSubheading: FunctionComponent<{ date: Date }> = ({
  date,
}) => {
  const subheading = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  return (
    <Typography
      sx={{
        color: ({ palette }) => palette.gray[70],
        fontSize: 15,
        fontWeight: 500,
      }}
    >
      {subheading}
    </Typography>
  );
};

const NotesSectionWrapper = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3.25, 4.5),
  borderRadius: 8,
  borderColor: theme.palette.gray[30],
  borderWidth: 1,
  borderStyle: "solid",
  backgroundColor: theme.palette.common.white,
}));

const NotesPage: NextPageWithLayout = () => {
  return (
    <>
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Notes",
            href: "/notes",
            id: "notes",
            icon: <QuickNoteIcon />,
          },
        ]}
        sx={{
          background: "transparent",
        }}
      />
      <Container>
        <Box display="flex" columnGap={7.5}>
          <Box
            sx={{
              width: timestampColumnWidth,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <TimestampCollectionHeading date={new Date()} />
            <TimestampCollectionSubheading date={new Date()} />
          </Box>
          <NotesSectionWrapper>
            <CreateQuickNote />
            <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
            <Box display="flex" marginTop={2.25}>
              <Box display="flex" alignItems="center" gap={1.5}>
                <Typography
                  sx={{
                    color: ({ palette }) => palette.gray[90],
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  Create new
                </Typography>
                <CreateChip
                  variant="outlined"
                  href="/new/entity"
                  component="a"
                  label="Entity"
                  clickable
                />
                <CreateChip
                  variant="outlined"
                  href="/new/types/entity-type"
                  component="a"
                  label="Type"
                  clickable
                />
              </Box>
            </Box>
          </NotesSectionWrapper>
        </Box>
      </Container>
    </>
  );
};

NotesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default NotesPage;
