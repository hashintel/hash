import { LinkEntityAndRightEntity } from "@blockprotocol/graph/.";
import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, theme } from "@local/design-system";
import { AutofillSuggestion } from "@mapbox/search-js-core";
import {
  CircularProgress,
  Collapse,
  Fade,
  Link,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Autocomplete, { autocompleteClasses } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressCard } from "./address-card";
import { MapboxIcon } from "./icons/mapbox-icon";
import { TriangleExclamationIcon } from "./icons/triangle-exclamation-icon";
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
      <Box
        ref={blockRootRef}
        sx={{ display: "inline-block" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Fade
          in={hovered || autocompleteFocused || animatingIn || animatingOut}
        >
          <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap" }}>
            <Link
              //  @todo: link this to the block's hub page
              href=""
              target="_blank"
              variant="regularTextLabels"
              sx={({ palette }) => ({
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                fontSize: 15,
                lineHeight: 1,
                letterSpacing: -0.02,
                marginBottom: 1.5,
                whiteSpace: "nowrap",
                color: palette.gray[50],
                fill: palette.gray[40],
                ":hover": {
                  color: palette.gray[60],
                  fill: palette.gray[50],
                },
              })}
            >
              Get help{" "}
              <FontAwesomeIcon
                icon={faQuestionCircle}
                sx={{ fontSize: 16, ml: 1, fill: "inherit" }}
              />
            </Link>

            <Typography
              variant="regularTextLabels"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                fontSize: 15,
                lineHeight: 1,
                letterSpacing: -0.02,
                marginBottom: 1.5,
                whiteSpace: "nowrap",
                color: ({ palette }) => palette.gray[50],
              }}
            >
              Using
              {!selectedAddress ? (
                <>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      color: ({ palette }) => palette.gray[60],
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
                  color: ({ palette }) => palette.gray[60],
                  mx: 1,
                }}
              >
                <MapboxIcon sx={{ fontSize: 16, mr: 0.375 }} />
                Mapbox Static Images
              </Box>
              to render a fixed map
            </Typography>
          </Box>
        </Fade>

        <Collapse
          in={!selectedAddress && !animatingIn}
          onEntered={() => setAnimatingOut(false)}
        >
          <Box sx={{ display: "flex", gap: 1.5 }}>
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
                      endAdornment: suggestionsError ? (
                        <TriangleExclamationIcon
                          sx={{
                            fontSize: 14,
                            fill: ({ palette }) => palette.red[70],
                          }}
                        />
                      ) : suggestionsLoading ? (
                        <CircularProgress />
                      ) : (
                        <FontAwesomeIcon
                          icon={faSearch}
                          sx={{
                            fontSize: 14,
                            color: ({ palette }) => palette.gray[40],
                          }}
                        />
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
                  <Stack component="li" {...props}>
                    <Typography
                      variant="microText"
                      sx={{
                        fontSize: 14,
                        fontWeight: 500,
                        lineHeight: "18px",
                        color: ({ palette }) => palette.common.black,
                        marginBottom: 0.5,
                      }}
                    >
                      {label}
                    </Typography>

                    <Typography
                      variant="microText"
                      sx={{
                        fontSize: 13,
                        lineHeight: "18px",
                        color: ({ palette }) => palette.gray[50],
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
                      "drop-shadow(0px 11px 30px rgba(61, 78, 133, 0.04)) drop-shadow(0px 7.12963px 18.37px rgba(61, 78, 133, 0.05)) drop-shadow(0px 4.23704px 8.1px rgba(61, 78, 133, 0.06)) drop-shadow(0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07))",
                    border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                    boxShadow: "none",
                    [`.${autocompleteClasses.listbox}`]: {
                      padding: "0px",
                      maxHeight: "unset",
                      [`.${autocompleteClasses.option}`]: {
                        alignItems: "flex-start",
                        paddingX: ({ spacing }) => `${spacing(2.5)} !important`,
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
                  paddingX: ({ spacing }) => `${spacing(2.75)} !important`,
                },
              }}
            />

            {suggestionsError ? (
              <Box
                display="flex"
                flexDirection="column"
                justifyContent="center"
                gap={1}
              >
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    fontWeight: 700,
                    fontSize: 13,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    color: ({ palette }) => palette.black,
                  }}
                >
                  <Box
                    component="span"
                    sx={{ color: ({ palette }) => palette.red[60] }}
                  >
                    Error connecting
                  </Box>{" "}
                  to the Block Protocol
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 500,
                    fontSize: 15,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    color: ({ palette }) => palette.gray[50],
                  }}
                >
                  Check your network connection or{" "}
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                      color: ({ palette }) => palette.gray[70],
                    }}
                  >
                    contact support
                  </Box>{" "}
                  if this issue persists.
                </Typography>
              </Box>
            ) : null}
          </Box>
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
              readonly={readonly}
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
    </ThemeProvider>
  );
};
