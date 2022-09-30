import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { Fragment } from "react";
import { TopContextBar } from "../../../../shared/top-context-bar";
import { OntologyChip } from "../../../entity-types/ontology-chip";
import { PlaceholderIcon } from "../../../entity-types/placeholder-icon";
import { QuestionIcon } from "../../../entity-types/question-icon";
import { EntityPageTabs } from "./entity-page-tabs";

const otherLabels = ["MSFT", "Microsoft Corporation", "MS"];
const tempLogoSrc = "https://pngimg.com/uploads/microsoft/microsoft_PNG13.png";

export const EntityPageHeader = () => {
  return (
    <Box bgcolor="white">
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Types",
            href: "#",
            id: "types",
          },
          {
            title: "Entities",
            href: "#",
            id: "entities",
          },
          {
            title: "Microsoft",
            href: "#",
            id: "entityId",
            icon: <img src={tempLogoSrc} alt="logo" width={16} height={16} />,
          },
        ]}
        scrollToTop={() => {}}
      />
      <Box py={3.75}>
        <Container>
          <OntologyChip
            icon={<PlaceholderIcon />}
            domain="hash.ai"
            path={
              <>
                <Typography color="inherit" fontWeight="bold">
                  @acme-corp
                </Typography>
                /entities
                <Typography color="inherit" fontWeight="bold">
                  /microsoft
                </Typography>
              </>
            }
            sx={[
              {
                marginBottom: 2,
                "> *": { color: (theme) => theme.palette.blue[70] },
              },
            ]}
          />

          <Stack direction="row" alignItems="center" spacing={2}>
            <Box component="img" src={tempLogoSrc} width={40} height={40} />
            <Typography variant="h1" fontWeight="bold">
              Microsoft
            </Typography>
          </Stack>

          <Box display="flex" gap={1}>
            <Typography
              variant="smallTextLabels"
              color={(theme) => theme.palette.gray[70]}
              fontWeight="500"
            >
              {otherLabels.length ? (
                <>
                  Also appears as
                  {otherLabels.map((label, index) => {
                    let separator = ",";

                    if (index === otherLabels.length - 2) {
                      separator = ", and";
                    } else if (index === otherLabels.length - 1) {
                      separator = "";
                    }

                    return (
                      <Fragment key={label}>
                        <Tooltip
                          componentsProps={{
                            tooltip: { sx: { maxWidth: "none" } },
                          }}
                          placement="top"
                          title={
                            <>
                              When referenced as a <b>NASDAQ-Traded Company</b>
                            </>
                          }
                        >
                          <b>{` ${label}`}</b>
                        </Tooltip>
                        {separator}
                      </Fragment>
                    );
                  })}
                </>
              ) : (
                "Not known by any other names"
              )}
            </Typography>
            <QuestionIcon sx={{ color: (theme) => theme.palette.gray[50] }} />
          </Box>
        </Container>
      </Box>

      <EntityPageTabs />
    </Box>
  );
};
