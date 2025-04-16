import type {
  BaseUrl,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  Box,
  Checkbox,
  CircularProgress,
  List,
  ListItem,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo } from "react";

import { Button } from "../../../shared/ui/button";
import { Modal } from "../../../shared/ui/modal";
import type { EntityTypeDependent } from "./use-entity-type-dependents";

type UpgradeDependentsModalProps = {
  dependents: Record<BaseUrl, EntityTypeDependent>;
  excludedDependencies: BaseUrl[];
  loading: boolean;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  setDependenciesToExclude: (excludedDependencies: BaseUrl[]) => void;
  upgradingEntityType: Pick<EntityType, "title" | "$id">;
};

type DependentForDisplay = Omit<EntityTypeDependent, "dependentOn"> & {
  dependentOn: string[];
  namespace?: string;
  toggleable: boolean;
};

const extractNamespace = (id: VersionedUrl) => {
  return id.match(/\/(@[^/]+)/)?.[1];
};

const DependentListItem = ({
  dependent,
  toggleExcluded,
  showNamespace,
}: {
  dependent: DependentForDisplay;
  toggleExcluded: (excluded: boolean) => void;
  showNamespace: boolean;
}) => {
  const {
    dependentOn,
    namespace,
    entityType,
    noFurtherTraversalBecause,
    toggleable,
  } = dependent;

  return (
    <ListItem
      sx={{
        px: 0,
        py: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        lineHeight: 1,
      }}
    >
      <Stack direction="row" alignItems="center">
        {showNamespace && namespace && (
          <Box
            component="span"
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontWeight: 400,
              fontSize: 13,
              mr: "1px",
            }}
          >
            {`${namespace}`}
            <Box component="span" ml="1px">
              /
            </Box>
          </Box>
        )}
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 500,
            color: ({ palette }) => palette.gray[90],
          }}
        >
          {entityType.title}
        </Typography>
        <Box
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 400,
            ml: 0.8,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          (depends on {dependentOn.join(", ")})
        </Box>
      </Stack>
      <Box mr={4}>
        {toggleable ? (
          <Checkbox
            checked={!noFurtherTraversalBecause}
            onChange={() => toggleExcluded(!noFurtherTraversalBecause)}
            sx={{
              svg: {
                rect: {
                  stroke: "#ddd",
                },
                width: 18,
                height: 18,
              },
            }}
          />
        ) : (
          <Typography
            sx={{ color: ({ palette }) => palette.gray[50], fontSize: 13 }}
          >
            External
          </Typography>
        )}
      </Box>
    </ListItem>
  );
};

export const UpgradeDependentsModal = ({
  dependents,
  excludedDependencies,
  loading,
  open,
  onCancel,
  onConfirm,
  setDependenciesToExclude,
  upgradingEntityType,
}: UpgradeDependentsModalProps) => {
  const { upgradingDependencies, notUpgradingDependencies, showNamespace } =
    useMemo(() => {
      const upgrading: DependentForDisplay[] = [];
      const notUpgrading: DependentForDisplay[] = [];

      const namespacesSeen = new Set<string>();

      for (const dependent of Object.values(dependents)) {
        const dependentOn = Array.from(dependent.dependentOn).map((baseUrl) => {
          if (baseUrl === extractBaseUrl(upgradingEntityType.$id)) {
            return upgradingEntityType.title;
          }

          const title = dependents[baseUrl]?.entityType.title;

          if (!title) {
            throw new Error(`No title found for dependent ${baseUrl}`);
          }

          return title;
        });

        const namespace = extractNamespace(dependent.entityType.$id);

        if (namespace) {
          namespacesSeen.add(namespace);
        }

        if (dependent.noFurtherTraversalBecause) {
          notUpgrading.push({
            ...dependent,
            dependentOn,
            namespace,
            toggleable: dependent.noFurtherTraversalBecause === "user-excluded",
          });
        } else {
          upgrading.push({
            ...dependent,
            dependentOn,
            namespace,
            toggleable: true,
          });
        }
      }

      return {
        upgradingDependencies: upgrading,
        notUpgradingDependencies: notUpgrading,
        showNamespace: namespacesSeen.size > 1,
      };
    }, [dependents, upgradingEntityType]);

  return (
    <Modal
      contentStyle={{ p: { xs: 0, md: 0 } }}
      header={{
        title: `Upgrade types using ${upgradingEntityType.title}?`,
      }}
      open={open}
      onClose={onCancel}
    >
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box>
          <Typography
            variant="smallTextParagraphs"
            sx={{ display: "block", lineHeight: 1.3 }}
          >
            This entity type is referenced by other entity types. You can choose
            which of these to automatically upgrade. All selected entity types
            will be upgraded to use the latest version of each other.
          </Typography>
          <Typography
            variant="smallTextParagraphs"
            sx={{ display: "block", lineHeight: 1.3, mt: 1.5 }}
          >
            Any you choose not to upgrade, or which are in webs you don't belong
            to, will continue to use the previous version.
          </Typography>
        </Box>
        {loading ? (
          <Stack direction="row" alignItems="center" mt={2} mb={1} ml={0.2}>
            <CircularProgress size={16} />
            <Typography
              variant="smallTextParagraphs"
              sx={{ ml: 1, color: ({ palette }) => palette.gray[70] }}
            >
              Checking for affected types...
            </Typography>
          </Stack>
        ) : (
          <>
            <Stack maxHeight={300} overflow="auto">
              {upgradingDependencies.length > 0 && (
                <Box mt={2}>
                  <Typography variant="smallCaps">Upgrading</Typography>
                  <List>
                    {upgradingDependencies.map((dependent) => (
                      <DependentListItem
                        key={dependent.entityType.$id}
                        dependent={dependent}
                        showNamespace={showNamespace}
                        toggleExcluded={() => {
                          setDependenciesToExclude([
                            ...excludedDependencies,
                            extractBaseUrl(dependent.entityType.$id),
                          ]);
                        }}
                      />
                    ))}
                  </List>
                </Box>
              )}
              {notUpgradingDependencies.length > 0 && (
                <Box mt={2}>
                  <Typography variant="smallCaps">Not upgrading</Typography>
                  <List>
                    {notUpgradingDependencies.map((dependent) => (
                      <DependentListItem
                        key={dependent.entityType.$id}
                        dependent={dependent}
                        showNamespace={showNamespace}
                        toggleExcluded={() => {
                          setDependenciesToExclude(
                            excludedDependencies.filter(
                              (baseUrl) =>
                                baseUrl !==
                                extractBaseUrl(dependent.entityType.$id),
                            ),
                          );
                        }}
                      />
                    ))}
                  </List>
                </Box>
              )}
            </Stack>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
                pt: 1.5,
                mt: 1.5,
              }}
            >
              <Button variant="primary" onClick={onConfirm} size="small">
                Confirm and save
              </Button>
              <Button variant="tertiary" onClick={onCancel} size="small">
                Cancel upgrade
              </Button>
            </Stack>
          </>
        )}
      </Box>
    </Modal>
  );
};
