import { Chip } from "@hashintel/hash-design-system/chip";
import { Stack, Typography } from "@mui/material";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { WhiteCard } from "../../entity-types/white-card";
import { EntityPageWrapper } from "./shared/entity-page-wrapper";
import { EntitySection } from "./shared/entity-section";

const Page: NextPageWithLayout = () => {
  return (
    <EntityPageWrapper>
      <EntitySection title="Types">
        <Typography>Here are the Types</Typography>
      </EntitySection>

      <EntitySection
        title="Properties"
        titleStartContent={
          <Stack direction="row" spacing={1.5}>
            <Chip size="xs" label="8 Values" />
            <Chip size="xs" variant="outlined" label="112 empty" />
          </Stack>
        }
      >
        <WhiteCard>
          <Typography>Here are the Properties</Typography>
        </WhiteCard>
      </EntitySection>

      <EntitySection title="Links">
        <Typography>Here are the Links</Typography>
      </EntitySection>

      <EntitySection title="Peers">
        <Typography>Here are the Peers</Typography>
      </EntitySection>
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
