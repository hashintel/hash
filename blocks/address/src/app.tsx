import { LinkEntityAndRightEntity } from "@blockprotocol/graph/.";
import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import { theme } from "@local/design-system";
import { AutofillSuggestion } from "@mapbox/search-js-core";
import SearchIcon from "@mui/icons-material/Search";
import {
  CircularProgress,
  Collapse,
  Fade,
  styled,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Autocomplete, { autocompleteClasses } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressCard } from "./address-card";
import { CircleQuestionIcon } from "./icons/circle-question-icon";
import { MapboxIcon } from "./icons/mapbox-icon";
import {
  Address as AddressEntity,
  AddressLink,
  File as FileEntity,
  ImageLink,
  RootEntity,
} from "./types";
import { Address, useMapbox } from "./useMapbox";

const addressTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/address/v/1";
const addressLinkTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/address-link/v/1";

const fileTypeId = "https://alpha.hash.ai/@luisbett/types/entity-type/file/v/1";
const imageUrlKey = "https://alpha.hash.ai/@luisbett/types/property-type/url/";
const imageLinkTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/image/v/1";

const titleKey = "https://alpha.hash.ai/@hash/types/property-type/title/";
const descriptionKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/description/";

const localityKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/addresslocality/";
const regionKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/addressregion/";
const postalCodeKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/postalcode/";
const streetKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/streetaddress/";
const countryKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/addresscountry/";
const fullAddressKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/fulladdress/";

const accessToken = "";

const getOptionLabel = (option: AutofillSuggestion | string) =>
  typeof option === "string" ? option : option.place_name ?? "";

const TopBarTypography = styled(Typography)(() => ({
  display: "inline-flex",
  alignItems: "center",
  fontFamily: "Inter",
  fontSize: "15px !important",
  lineHeight: 1,
  letterSpacing: -0.02,
  color: "#91A5BA",
  marginBottom: "12px !important",
  whiteSpace: "nowrap",
}));

export const App: BlockComponent<true, RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } =
    useEntitySubgraph(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  const {
    suggestions,
    suggestionsLoading,
    suggestionsError,
    fetchSuggestions,
    selectAddress,
    selectedAddress,
  } = useMapbox(accessToken);

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const { [titleKey]: title, [descriptionKey]: description } = properties;

  const addressLinkedEntity: LinkEntityAndRightEntity<true> = useMemo(
    () =>
      linkedEntities.find(
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId === addressLinkTypeId,
      ),
    [linkedEntities],
  )!;

  const addressEntity: AddressEntity | undefined =
    addressLinkedEntity?.rightEntity[0];
  const addressLinkEntity: AddressLink | undefined =
    addressLinkedEntity?.linkEntity[0];

  const fullAddress = addressEntity?.properties[fullAddressKey];

  const imageLinkedEntity: LinkEntityAndRightEntity<true> = useMemo(
    () =>
      linkedEntities.find(
        ({ linkEntity }) =>
          linkEntity[0]?.metadata.entityTypeId === imageLinkTypeId,
      ),
    [linkedEntities],
  )!;

  const fileEntity: FileEntity | undefined = imageLinkedEntity?.rightEntity[0];
  const imageLinkEntity: ImageLink | undefined =
    imageLinkedEntity?.linkEntity[0];

  const mapUrl = fileEntity?.properties[imageUrlKey];

  const updateTitle = async (title: string) => {
    await graphService?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [titleKey]: title,
        },
      },
    });
  };

  const updateDescription = async (description: string) => {
    await graphService?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [descriptionKey]: description,
        },
      },
    });
  };

  const uploadMap = async (mapFile: File) => {
    if (readonly || !mapFile) {
      return;
    }

    graphService
      ?.uploadFile({
        data: { file: mapFile },
      })
      .then(async (uploadFileResponse) => {
        const imageUrl =
          uploadFileResponse.data?.properties[
            "https://blockprotocol.org/@blockprotocol/types/property-type/url/"
          ];

        if (imageUrl) {
          const fileProperties = {
            [imageUrlKey]: imageUrl,
          };

          const createFileEntityResponse = await (!fileEntity
            ? graphService?.createEntity({
                data: {
                  entityTypeId: fileTypeId,
                  properties: fileProperties,
                },
              })
            : graphService?.updateEntity({
                data: {
                  entityId: fileEntity.metadata.recordId.entityId,
                  entityTypeId: fileEntity.metadata.entityTypeId,
                  properties: fileProperties,
                },
              }));

          const fileEntityId =
            createFileEntityResponse?.data?.metadata.recordId.entityId;

          if (!imageLinkEntity && fileEntityId) {
            await graphService?.createEntity({
              data: {
                entityTypeId: imageLinkTypeId,
                properties: {},
                linkData: {
                  leftEntityId: entityId,
                  rightEntityId: fileEntityId,
                },
              },
            });
          }
        }
      });
  };

  const updateAddress = async (address?: Address) => {
    if (readonly || !address) {
      return;
    }

    const {
      addressLocality,
      addressRegion,
      postalCode,
      streetAddress,
      addressCountry,
      fullAddress,
    } = address;

    const addressProperties = {
      [localityKey]: addressLocality,
      [regionKey]: addressRegion,
      [postalCodeKey]: postalCode,
      [streetKey]: streetAddress,
      [countryKey]: addressCountry,
      [fullAddressKey]: fullAddress,
    };

    const createAddressEntityResponse = await (!addressEntity
      ? graphService?.createEntity({
          data: {
            entityTypeId: addressTypeId,
            properties: addressProperties,
          },
        })
      : graphService?.updateEntity({
          data: {
            entityId: addressEntity.metadata.recordId.entityId,
            entityTypeId: addressEntity.metadata.entityTypeId,
            properties: addressProperties,
          },
        }));

    const addressEntityId =
      createAddressEntityResponse?.data?.metadata.recordId.entityId;

    if (addressEntityId) {
      if (!addressLinkEntity) {
        await graphService?.createEntity({
          data: {
            entityTypeId:
              "https://alpha.hash.ai/@luisbett/types/entity-type/address-link/v/1",
            properties: {},
            linkData: {
              leftEntityId: entityId,
              rightEntityId: addressEntityId,
            },
          },
        });
      }
    }
  };

  const resetBlock = async () => {
    selectAddress();
    await graphService?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {},
      },
    });
    if (imageLinkEntity) {
      await graphService?.deleteEntity({
        data: {
          entityId: imageLinkEntity.metadata.recordId.entityId,
        },
      });
    }
    if (addressLinkEntity) {
      await graphService?.deleteEntity({
        data: {
          entityId: addressLinkEntity.metadata.recordId.entityId,
        },
      });
    }
  };

  useEffect(() => {
    if (selectedAddress) {
      updateAddress(selectedAddress);
      updateTitle(selectedAddress.featureName);
    } else {
      resetBlock();
    }
  }, [selectedAddress]);

  useEffect(() => {
    if (selectedAddress?.file) {
      uploadMap(selectedAddress.file);
    }
  }, [selectedAddress?.file]);

  return (
    <ThemeProvider theme={theme}>
      <Box ref={blockRootRef}>
        <Box
          sx={{ fontFamily: "Inter" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Fade
            in={hovered || autocompleteFocused || animatingIn || animatingOut}
          >
            <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap" }}>
              <Tooltip title="Get help">
                <TopBarTypography>
                  Get help{" "}
                  <CircleQuestionIcon sx={{ fontSize: 16, ml: 1, mr: 0.375 }} />
                </TopBarTypography>
              </Tooltip>

              <TopBarTypography>
                Using
                {!selectedAddress ? (
                  <>
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "#758AA1",
                        mx: 1,
                      }}
                    >
                      <MapboxIcon sx={{ fontSize: 16, mr: 0.375 }} />
                      Mapbox Address Autofill{" "}
                    </Box>
                    and
                  </>
                ) : null}
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: "#758AA1",
                    mx: 1,
                  }}
                >
                  <MapboxIcon sx={{ fontSize: 16, mr: 0.375 }} />
                  Mapbox Static Images
                </Box>
                to render a fixed map
              </TopBarTypography>
            </Box>
          </Fade>

          <Collapse
            in={!selectedAddress && !animatingIn}
            onEntered={() => setAnimatingOut(false)}
          >
            <Autocomplete
              onFocus={() => setAutocompleteFocused(true)}
              onBlur={() => setAutocompleteFocused(false)}
              getOptionLabel={getOptionLabel}
              options={suggestions}
              popupIcon={null}
              freeSolo
              onInputChange={(_event, newInputValue) => {
                fetchSuggestions(newInputValue);
              }}
              onChange={(_event, option) => {
                if (option && typeof option === "object") {
                  setAnimatingIn(true);

                  setTimeout(() => {
                    selectAddress(option.action.id);
                  }, 300);
                }
              }}
              filterOptions={(options) => options}
              renderInput={({ InputProps, ...params }) => {
                return (
                  <TextField
                    {...params}
                    placeholder="Start typing to enter an address or location"
                    InputProps={{
                      ...InputProps,
                      endAdornment: suggestionsLoading ? (
                        <CircularProgress />
                      ) : (
                        <SearchIcon sx={{ color: "#C1CFDE" }} />
                      ),
                    }}
                    sx={{
                      display: "inline-flex",
                      width: "auto",
                      minWidth: 420,
                    }}
                  />
                );
              }}
              renderOption={(props, option) => {
                const label = getOptionLabel(option);
                return (
                  <Stack
                    component="li"
                    {...props}
                    sx={{
                      [`.${autocompleteClasses.option}`]: {
                        alignItems: "flex-start !important",
                        paddingX: 2.5,
                        paddingY: 1.25,
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        display: "flex",
                        fontFamily: "Inter",
                        fontWeight: 500,
                        fontSize: "14px !important",
                        lineHeight: "18px",
                        color: "#000000",
                        marginBottom: "4px !important",
                      }}
                    >
                      {label}
                    </Typography>

                    <Typography
                      sx={{
                        display: "flex",
                        fontFamily: "Inter",
                        fontWeight: 400,
                        fontSize: "13px !important",
                        lineHeight: "18px",
                        color: "#91A5BA",
                        marginBottom: "0 !important",
                      }}
                    >
                      {option.country}
                    </Typography>
                  </Stack>
                );
              }}
              PaperComponent={({ children, ...props }) => (
                <Paper
                  {...props}
                  sx={{
                    filter:
                      "drop-shadow(0px 11px 30px rgba(61, 78, 133, 0.04)) drop-shadow(0px 7.12963px 18.37px rgba(61, 78, 133, 0.05)) drop-shadow(0px 4.23704px 8.1px rgba(61, 78, 133, 0.06)) drop-shadow(0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07)) !important",
                    border: "1px solid #EBF2F7",
                    boxShadow: "none",
                    [`.${autocompleteClasses.listbox}`]: {
                      maxHeight: "unset",
                      padding: "0px !important",
                      margin: "0px !important",
                      [`.${autocompleteClasses.option}`]: {
                        alignItems: "flex-start !important",
                        paddingX: 2.5,
                        paddingY: 1.25,
                      },
                    },
                  }}
                >
                  {children}
                </Paper>
              )}
              sx={{
                [`.${autocompleteClasses.input}`]: {
                  paddingLeft: "0 !important",
                },
                [`.${autocompleteClasses.inputRoot}`]: {
                  paddingLeft: 2.75,
                  paddingRight: ({ spacing }) => `${spacing(2.75)}!important`,
                },
              }}
            />
          </Collapse>

          <Collapse
            in={!!selectedAddress && !animatingOut}
            onEntered={() => setAnimatingIn(false)}
          >
            {selectedAddress ? (
              <AddressCard
                title={selectedAddress.featureName ?? title}
                description={description}
                fullAddress={selectedAddress.fullAddress ?? fullAddress}
                mapUrl={selectedAddress.mapUrl ?? mapUrl}
                hovered={hovered}
                onClose={() => {
                  setAnimatingOut(true);

                  setTimeout(() => {
                    selectAddress();
                  }, 300);
                }}
                updateTitle={updateTitle}
                updateDescription={updateDescription}
              />
            ) : null}
          </Collapse>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
