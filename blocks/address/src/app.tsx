import { LinkEntityAndRightEntity } from "@blockprotocol/graph/.";
import {
  useEntitySubgraph,
  useGraphBlockModule,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, theme } from "@hashintel/design-system";
import { AutofillSuggestion } from "@mapbox/search-js-core";
import {
  CircularProgress,
  Collapse,
  Fade,
  Link,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Autocomplete, { autocompleteClasses } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const DEFAULT_ZOOM_LEVEL = 16;
const ZOOM_LEVEL_STEP_SIZE = 2;
const MAX_ZOOM_LEVEL = 20;
const MIN_ZOOM_LEVEL = 10;

const addressTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/address/v/1";
const addressLinkTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/address-link/v/1";
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

const fileTypeId = "https://alpha.hash.ai/@luisbett/types/entity-type/file/v/1";
const imageUrlKey = "https://alpha.hash.ai/@luisbett/types/property-type/url/";
const imageLinkTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/image-link/v/5";

const titleKey = "https://alpha.hash.ai/@hash/types/property-type/title/";
const descriptionKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/description/";
const addressIdKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/addressid/";
const zoomLevelKey =
  "https://alpha.hash.ai/@luisbett/types/property-type/zoomlevel/";

const getOptionLabel = (option: AutofillSuggestion | string) =>
  typeof option === "string" ? option : option.place_name ?? "";

export const App: BlockComponent<true, RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } =
    useEntitySubgraph(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const {
    [titleKey]: title,
    [descriptionKey]: description,
    [addressIdKey]: addressId,
  } = properties;

  const zoomLevel = properties[zoomLevelKey] ?? DEFAULT_ZOOM_LEVEL;

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

  const imageLinkedEntity: LinkEntityAndRightEntity<true> | undefined = useMemo(
    () =>
      linkedEntities.find(({ linkEntity }) => {
        return (
          linkEntity.metadata.entityTypeId === imageLinkTypeId &&
          linkEntity.properties[zoomLevelKey] === zoomLevel &&
          linkEntity.properties[addressIdKey] === addressId
        );
      }),
    [linkedEntities, zoomLevel, addressId],
  );

  const fileEntity: FileEntity | undefined = imageLinkedEntity?.rightEntity;
  const imageLinkEntity = imageLinkedEntity?.linkEntity as
    | ImageLink
    | undefined;

  const mapUrl = fileEntity?.properties[imageUrlKey];

  const availableZoomLevels = useMemo(() => {
    return linkedEntities
      .filter(({ linkEntity }) => {
        return (
          linkEntity.metadata.entityTypeId === imageLinkTypeId &&
          linkEntity.properties[addressIdKey] === addressId
        );
      })
      .map(({ linkEntity }) => linkEntity.properties[zoomLevelKey]);
  }, [linkedEntities]);

  const {
    suggestions,
    suggestionsLoading,
    suggestionsError,
    fetchSuggestions,
    selectAddress,
    selectedAddress,
    mapFile,
  } = useMapbox(
    blockRootRef,
    zoomLevel,
    !availableZoomLevels.includes(zoomLevel),
  );

  const updateBlockAddress = async (address: Address) => {
    await graphModule?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          [addressIdKey]: address.addressId,
          [titleKey]: address.featureName,
          [descriptionKey]: "",
          [zoomLevelKey]: 16,
        },
      },
    });
  };

  const updateTitle = async (title: string) => {
    await graphModule?.updateEntity({
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
    await graphModule?.updateEntity({
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

  const updateZoomLevel = async (zoomLevel: number) => {
    await graphModule?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [zoomLevelKey]: zoomLevel,
        },
      },
    });
  };

  const incrementZoomLevel = useCallback(() => {
    if (zoomLevel <= MAX_ZOOM_LEVEL - ZOOM_LEVEL_STEP_SIZE) {
      updateZoomLevel(zoomLevel + ZOOM_LEVEL_STEP_SIZE);
    }
  }, [zoomLevel, properties]);

  const decrementZoomLevel = useCallback(() => {
    if (zoomLevel >= MIN_ZOOM_LEVEL + ZOOM_LEVEL_STEP_SIZE) {
      updateZoomLevel(zoomLevel - ZOOM_LEVEL_STEP_SIZE);
    }
  }, [zoomLevel, properties]);

  const uploadMap = async (mapFile: File) => {
    if (readonly || !mapFile) {
      return;
    }

    graphModule
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

          const createFileEntityResponse = await graphModule?.createEntity({
            data: {
              entityTypeId: fileTypeId,
              properties: fileProperties,
            },
          });

          const fileEntityId =
            createFileEntityResponse?.data?.metadata.recordId.entityId;

          if (!imageLinkEntity && fileEntityId && addressId) {
            await graphModule?.createEntity({
              data: {
                entityTypeId: imageLinkTypeId,
                properties: {
                  [zoomLevelKey]: zoomLevel,
                  [addressIdKey]: addressId,
                },
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
      ? graphModule?.createEntity({
          data: {
            entityTypeId: addressTypeId,
            properties: addressProperties,
          },
        })
      : graphModule?.updateEntity({
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
        await graphModule?.createEntity({
          data: {
            entityTypeId: addressLinkTypeId,
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
    await graphModule?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {},
      },
    });

    // Remove the address link and all image links
    for (const { linkEntity } of linkedEntities) {
      if (linkEntity[0]) {
        await graphModule?.deleteEntity({
          data: {
            entityId: linkEntity[0].metadata.recordId.entityId,
          },
        });
      }
    }
  };

  useEffect(() => {
    if (selectedAddress) {
      if (addressId !== selectedAddress.addressId) {
        updateAddress(selectedAddress);
        updateBlockAddress(selectedAddress);
      }
    } else {
      resetBlock();
    }
  }, [selectedAddress]);

  useEffect(() => {
    if (mapFile) {
      uploadMap(mapFile);
    }
  }, [mapFile]);

  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <ThemeProvider theme={theme}>
      <Box
        ref={blockRootRef}
        sx={{ display: "inline-block", width: { xs: "100%", md: "auto" } }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {!readonly ? (
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
                  flexWrap: "wrap",
                  color: ({ palette }) => palette.gray[50],
                }}
              >
                <Box component="span" sx={{ mr: 1 }}>
                  Using
                </Box>
                {!selectedAddress ? (
                  <>
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: ({ palette }) => palette.gray[60],
                        mr: 1,
                      }}
                    >
                      <MapboxIcon sx={{ fontSize: 16, mr: 0.375 }} />
                      Mapbox Address Autofill
                    </Box>
                    <Box component="span" sx={{ mr: 1 }}>
                      and
                    </Box>
                  </>
                ) : null}
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: ({ palette }) => palette.gray[60],
                    mr: 1,
                  }}
                >
                  <MapboxIcon sx={{ fontSize: 16, mr: 0.375 }} />
                  Mapbox Static Images
                </Box>
                to render a fixed map
              </Typography>
            </Box>
          </Fade>
        ) : null}

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
                    selectAddress(option);
                  }, 300);
                }
              }}
              filterOptions={(options) => options}
              renderInput={({ InputProps, ...params }) => {
                return (
                  <TextField
                    {...params}
                    placeholder={
                      isMobile
                        ? "Enter an address"
                        : "Start typing to enter an address or location"
                    }
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
                      maxWidth: 420,
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
                width: 1,
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
                  to the Mapbox API
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
                  Check your network connection or contact support if this issue
                  persists.
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
              mapUrl={mapUrl}
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
              incrementZoomLevel={
                zoomLevel >= MAX_ZOOM_LEVEL ? undefined : incrementZoomLevel
              }
              decrementZoomLevel={
                zoomLevel <= MIN_ZOOM_LEVEL ? undefined : decrementZoomLevel
              }
            />
          ) : null}
        </Collapse>
      </Box>
    </ThemeProvider>
  );
};
