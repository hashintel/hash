import { faPlus, faWarning } from "@fortawesome/free-solid-svg-icons";
import { Button, Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Divider, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useState } from "react";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";
import { useSnackbar } from "../../../../components/hooks/useSnackbar";
import { SectionWrapper } from "../../shared/section-wrapper";
import { WhiteCard } from "../../shared/white-card";
import { EntityTypeSelector } from "../../types/entity-type/entity-type-selector";
import { EntityTypesContextProvider } from "../../types/entity-type/use-entity-types";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { LinksSectionEmptyState } from "./shared/links-section-empty-state";
import { PeersSectionEmptyState } from "./shared/peers-section-empty-state";
import { PropertiesSectionEmptyState } from "./shared/properties-section-empty-state";
import { useCreateNewEntityAndRedirect } from "./shared/use-create-new-entity-and-redirect";

export const NewEntityPage = () => {
  const router = useRouter();
  const snackbar = useSnackbar();
  const [isSelectingType, setIsSelectingType] = useState(false);
  const [loading, setLoading] = useState(false);
  const { authenticatedUser } = useAuthenticatedUser();

  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();

  return (
    <EntityPageWrapper label="New entity" makeTitleLighter>
      <SectionWrapper
        title="Types"
        titleStartContent={<Chip label="No type" size="xs" />}
      >
        <WhiteCard>
          <Box
            pt={3.75}
            pb={2}
            gap={0.75}
            display="flex"
            flexDirection="column"
            alignItems="center"
            textAlign="center"
          >
            <Typography
              display="flex"
              alignItems="center"
              variant="largeTextLabels"
              fontWeight={600}
              gap={1}
            >
              <FontAwesomeIcon icon={faWarning} sx={{ color: "yellow.80" }} />
              This entity requires a type
            </Typography>
            <Typography color="gray.60">
              Types describe an entity, and determine the properties and links
              that can be associated with it.
            </Typography>
          </Box>

          <Divider />

          <EntityTypesContextProvider>
            <Box
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "center",
                p: 3,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {isSelectingType ? (
                <EntityTypeSelector
                  onCancel={() => setIsSelectingType(false)}
                  onSelect={async (entityType) => {
                    try {
                      setIsSelectingType(false);
                      setLoading(true);

                      await createNewEntityAndRedirect(entityType.$id);
                    } catch (error: any) {
                      snackbar.error(error.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onCreateNew={(searchValue) => {
                    setLoading(true);

                    void router.push(
                      `/@${
                        authenticatedUser?.shortname
                      }/types/new/entity-type?name=${encodeURIComponent(
                        searchValue,
                      )}`,
                    );
                  }}
                />
              ) : (
                <>
                  <Button
                    loading={loading}
                    onClick={() => setIsSelectingType(true)}
                    startIcon={!loading && <FontAwesomeIcon icon={faPlus} />}
                  >
                    Add a type
                  </Button>
                  {!loading && (
                    <Typography variant="smallTextLabels" fontWeight={600}>
                      to start using this entity
                    </Typography>
                  )}
                </>
              )}
            </Box>
          </EntityTypesContextProvider>
        </WhiteCard>
      </SectionWrapper>

      <PropertiesSectionEmptyState />

      <LinksSectionEmptyState />

      <PeersSectionEmptyState />
    </EntityPageWrapper>
  );
};
