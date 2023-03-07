import { faPlus, faWarning } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Chip,
  FontAwesomeIcon,
  OntologyChip,
  OntologyIcon,
  WhiteCard,
} from "@hashintel/design-system";
import { Box, Divider, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { useSnackbar } from "../../../../components/hooks/use-snackbar";
import { WorkspaceContext } from "../../../shared/workspace-context";
import { SectionWrapper } from "../../shared/section-wrapper";
import { EntityTypeSelector } from "./create-entity-page/entity-type-selector";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";
import { LinksSectionEmptyState } from "./shared/links-section-empty-state";
import { PropertiesSectionEmptyState } from "./shared/properties-section-empty-state";

export const SelectEntityTypePage = () => {
  const router = useRouter();
  const snackbar = useSnackbar();
  const [isSelectingType, setIsSelectingType] = useState(false);
  const [loading, setLoading] = useState(false);

  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    throw new Error("Active workspace must be set");
  }

  return (
    <EntityPageWrapper
      header={
        <EntityPageHeader
          entityLabel="New entity"
          lightTitle
          chip={
            <OntologyChip
              icon={<OntologyIcon />}
              domain="hash.ai"
              path={
                <>
                  <Typography
                    color={(theme) => theme.palette.blue[70]}
                    fontWeight="bold"
                    component="span"
                  >
                    @{activeWorkspace.shortname}
                  </Typography>
                  <Typography
                    color={(theme) => theme.palette.blue[70]}
                    component="span"
                  >
                    /entities
                  </Typography>
                </>
              }
            />
          }
        />
      }
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 6.5,
        }}
      >
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

                      await router.push(
                        `/new/entity?entity-type-id=${encodeURIComponent(
                          entityType.$id,
                        )}`,
                      );
                    } catch (error: any) {
                      snackbar.error(error.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onCreateNew={(searchValue) => {
                    let href = `/new/types/entity-type`;
                    if (searchValue) {
                      href += `?name=${encodeURIComponent(searchValue)}`;
                    }

                    void router.push(href);
                  }}
                />
              ) : (
                <>
                  <Button
                    loading={loading}
                    onClick={() => setIsSelectingType(true)}
                    startIcon={!loading && <FontAwesomeIcon icon={faPlus} />}
                    sx={{ fontSize: 14, paddingX: 2 }}
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
          </WhiteCard>
        </SectionWrapper>

        <PropertiesSectionEmptyState />

        <LinksSectionEmptyState />

        {/* <PeersSectionEmptyState /> */}
      </Box>
    </EntityPageWrapper>
  );
};
