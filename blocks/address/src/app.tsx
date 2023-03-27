import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { AutofillSuggestion } from "@blockprotocol/service/dist/mapbox-types";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Autocomplete,
  BlockSettingsButton,
  FontAwesomeIcon,
  GetHelpLink,
  theme,
} from "@hashintel/design-system";
import {
  CircularProgress,
  Collapse,
  Fade,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { autocompleteClasses } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useCallback, useMemo, useRef, useState } from "react";
import { SizeMe } from "react-sizeme";

import { AddressCard, AddressCardLoading } from "./address-card";
import { MapboxIcon } from "./icons/mapbox-icon";
import { TriangleExclamationIcon } from "./icons/triangle-exclamation-icon";
import {
  Address as AddressEntity,
  AddressBlockHasAddressLinks,
  AddressBlockHasMapImageLinks,
  AddressBlockLinksByLinkTypeId,
  HasAddress,
  HasMapImage,
  RemoteFile,
  RootEntity,
} from "./types";
import { Address, useMapbox } from "./use-mapbox";

const INPUT_MAX_WIDTH = 420;
const DEFAULT_ZOOM_LEVEL = 16;
const ZOOM_LEVEL_STEP_SIZE = 2;
const MAX_ZOOM_LEVEL = 20;
const MIN_ZOOM_LEVEL = 10;

type RootEntityKey = keyof RootEntity["properties"];
type AddressEntityKey = keyof AddressEntity["properties"];
type FileUrlEntityKey = keyof RemoteFile["properties"];
type LinkType = keyof AddressBlockLinksByLinkTypeId;

// Root entity property types
export const titleKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";
export const descriptionKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const addressIdKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-address-id/";
export const zoomLevelKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-static-image-zoom-level/";

// Address entity property types
export const regionKey: AddressEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/address-level-1/";
export const postalCodeKey: AddressEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/postal-code/";
export const streetKey: AddressEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/street-address-line-1/";
export const countryKey: AddressEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/alpha-2-country-code/";
export const fullAddressKey: AddressEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mapbox-full-address/";

// Remote File property types
export const fileUrlKey: FileUrlEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

// Link entity types
export const hasAddressLink: LinkType =
  "https://blockprotocol.org/@hash/types/entity-type/has-address/v/1";
export const hasAddressMapLink: LinkType =
  "https://blockprotocol.org/@hash/types/entity-type/has-map-image/v/1";

// Relevant Entity types
export const addressTypeId =
  "https://blockprotocol.org/@hash/types/entity-type/address/v/2";

const getOptionLabel = (option: AutofillSuggestion | string) =>
  typeof option === "string" ? option : option.place_name ?? "";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
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
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  const [animatingIn, setAnimatingIn] = useState<AutofillSuggestion | null>();
  const [animatingOut, setAnimatingOut] = useState(false);

  const {
    [titleKey]: title,
    [descriptionKey]: description,
    [addressIdKey]: addressId,
  } = properties;

  const zoomLevel = properties[zoomLevelKey] ?? DEFAULT_ZOOM_LEVEL;

  const addressLinkedEntity = useMemo(
    () =>
      linkedEntities.find(
        ({ linkEntity }) => linkEntity.metadata.entityTypeId === hasAddressLink,
      ) as AddressBlockHasAddressLinks[0] | undefined,
    [linkedEntities],
  );

  const addressEntity: AddressEntity | undefined =
    addressLinkedEntity?.rightEntity;
  const addressLinkEntity: HasAddress | undefined =
    addressLinkedEntity?.linkEntity;

  const remoteFullAddress = addressEntity?.properties[fullAddressKey];

  const mapLinkedEntity = useMemo(
    () =>
      linkedEntities.find(({ linkEntity }) => {
        return (
          linkEntity.metadata.entityTypeId === hasAddressMapLink &&
          linkEntity.properties[zoomLevelKey] === zoomLevel &&
          linkEntity.properties[addressIdKey] === addressId
        );
      }) as AddressBlockHasMapImageLinks[0] | undefined,
    [linkedEntities, zoomLevel, addressId],
  );

  const mapEntity: RemoteFile | undefined = mapLinkedEntity?.rightEntity;
  const mapLinkEntity: HasMapImage | undefined = mapLinkedEntity?.linkEntity;

  const mapUrl = mapEntity?.properties[fileUrlKey];

  const availableZoomLevels = useMemo(() => {
    return linkedEntities
      .filter(({ linkEntity }) => {
        return (
          linkEntity.metadata.entityTypeId === hasAddressMapLink &&
          linkEntity.properties[addressIdKey] === addressId
        );
      })
      .map(({ linkEntity }) => linkEntity.properties[zoomLevelKey]);
  }, [linkedEntities, addressId]);

  const updateBlockAddress = async (address?: Address) => {
    if (readonly) {
      return;
    }

    await graphModule.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: address
          ? {
              [addressIdKey]: address.addressId,
              [titleKey]: address.featureName,
              [descriptionKey]: "",
              [zoomLevelKey]: DEFAULT_ZOOM_LEVEL,
            }
          : {},
      },
    });
  };

  const updateTitle = async (nweTitle: string) => {
    if (readonly) {
      return;
    }

    await graphModule.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [titleKey]: nweTitle,
        },
      },
    });
  };

  const updateDescription = async (newDescription: string) => {
    if (readonly) {
      return;
    }

    await graphModule.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [descriptionKey]: newDescription,
        },
      },
    });
  };

  const updateZoomLevel = useCallback(
    async (newZoomLevel: number) => {
      if (readonly) {
        return;
      }

      await graphModule.updateEntity({
        data: {
          entityId,
          entityTypeId,
          properties: {
            ...properties,
            [zoomLevelKey]: newZoomLevel,
          },
        },
      });
    },
    [entityId, entityTypeId, graphModule, properties, readonly],
  );

  const incrementZoomLevel = useCallback(async () => {
    if (zoomLevel <= MAX_ZOOM_LEVEL - ZOOM_LEVEL_STEP_SIZE) {
      await updateZoomLevel(zoomLevel + ZOOM_LEVEL_STEP_SIZE);
    }
  }, [zoomLevel, updateZoomLevel]);

  const decrementZoomLevel = useCallback(async () => {
    if (zoomLevel >= MIN_ZOOM_LEVEL + ZOOM_LEVEL_STEP_SIZE) {
      await updateZoomLevel(zoomLevel - ZOOM_LEVEL_STEP_SIZE);
    }
  }, [zoomLevel, updateZoomLevel]);

  const uploadMap = async (mapFile: File, mapAddressId: string) => {
    if (readonly) {
      return;
    }

    await graphModule
      .uploadFile({
        data: {
          file: mapFile,
          description: remoteFullAddress,
        },
      })
      .then(async (uploadFileResponse) => {
        const fileEntityId =
          uploadFileResponse.data?.metadata.recordId.entityId;

        if (!mapLinkEntity && mapAddressId && fileEntityId) {
          await graphModule.createEntity({
            data: {
              entityTypeId: hasAddressMapLink,
              properties: {
                [zoomLevelKey]: zoomLevel,
                [addressIdKey]: mapAddressId,
              },
              linkData: {
                leftEntityId: entityId,
                rightEntityId: fileEntityId,
              },
            },
          });
        }
      });
  };

  const updateAddress = async (address?: Address) => {
    if (readonly || !address) {
      return;
    }

    const {
      addressRegion,
      postalCode,
      streetAddress,
      addressCountry,
      fullAddress,
    } = address;

    const addressProperties = {
      [regionKey]: addressRegion,
      [postalCodeKey]: postalCode,
      [streetKey]: streetAddress,
      [countryKey]: addressCountry,
      [fullAddressKey]: fullAddress,
    };

    const createAddressEntityResponse = await (!addressEntity
      ? graphModule.createEntity({
          data: {
            entityTypeId: addressTypeId,
            properties: addressProperties,
          },
        })
      : graphModule.updateEntity({
          data: {
            entityId: addressEntity.metadata.recordId.entityId,
            entityTypeId: addressEntity.metadata.entityTypeId,
            properties: addressProperties,
          },
        }));

    const addressEntityId =
      createAddressEntityResponse.data?.metadata.recordId.entityId;

    if (addressEntityId) {
      if (!addressLinkEntity) {
        await graphModule.createEntity({
          data: {
            entityTypeId: hasAddressLink,
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

  const onSelectAddress = (address: Address) => {
    void updateAddress(address);
    void updateBlockAddress(address);
  };

  const {
    suggestions,
    suggestionsLoading,
    suggestionsError,
    mapError,
    fetchSuggestions,
    selectAddress,
    selectedAddress,
    selectedAddressLoading,
  } = useMapbox(
    blockRootRef,
    zoomLevel,
    !availableZoomLevels.includes(zoomLevel),
    onSelectAddress,
    uploadMap,
    addressId,
  );

  const resetBlock = async () => {
    if (readonly) {
      return;
    }

    selectAddress();
    void updateBlockAddress();

    // Remove the address link and all map links
    for (const { linkEntity } of linkedEntities) {
      await graphModule.deleteEntity({
        data: {
          entityId: linkEntity.metadata.recordId.entityId,
        },
      });
    }
  };

  const schema = useMemo(() => {
    return addressEntity
      ? JSON.stringify({
          "@context": "http://schema.org",
          "@type": "PostalAddress",
          addressCountry: addressEntity.properties[countryKey],
          addressRegion: addressEntity.properties[regionKey],
          postalCode: addressEntity.properties[postalCodeKey],
          streetAddress: addressEntity.properties[streetKey],
        })
      : null;
  }, [addressEntity]);

  const displayTitle = title ?? selectedAddress?.featureName;
  const displayFullAddress = selectedAddress?.fullAddress ?? remoteFullAddress;

  const shouldDisplayCard = !!displayFullAddress || selectedAddressLoading;

  return (
    <>
      {schema ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: schema }}
        />
      ) : null}
      <ThemeProvider theme={theme}>
        <SizeMe>
          {({ size }) => {
            const isMobile = (size.width ?? 0) < 620;
            const inputPlaceholder =
              (size.width ?? 0) < 400
                ? "Enter an address"
                : "Start typing to enter an address or location";

            return (
              <Box
                ref={blockRootRef}
                sx={{
                  display: "inline-block",
                  width: 1,
                  overflowX: "hidden",
                }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {!readonly ? (
                  <>
                    <Fade
                      in={
                        hovered ||
                        autocompleteFocused ||
                        !!animatingIn ||
                        animatingOut ||
                        (isMobile && mobileSettingsExpanded)
                      }
                    >
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          mb: 1.5,
                          columnGap: 3,
                          rowGap: isMobile ? 0 : 1,
                        }}
                      >
                        <GetHelpLink href="https://blockprotocol.org/@hash/blocks/address" />

                        {isMobile ? (
                          <BlockSettingsButton
                            expanded={mobileSettingsExpanded}
                            onClick={() =>
                              setMobileSettingsExpanded(!mobileSettingsExpanded)
                            }
                          />
                        ) : null}

                        <Collapse in={!isMobile || mobileSettingsExpanded}>
                          <Typography
                            variant="regularTextLabels"
                            sx={{
                              mt: isMobile ? 1 : 0,
                              display: "inline-flex",
                              alignItems: "center",
                              textDecoration: "none",
                              fontSize: 15,
                              lineHeight: 1,
                              letterSpacing: -0.02,
                              flexWrap: "wrap",
                              color: ({ palette }) => palette.gray[50],
                            }}
                          >
                            <Box component="span" sx={{ mr: 1 }}>
                              Using
                            </Box>
                            {!shouldDisplayCard ? (
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
                                  <MapboxIcon
                                    sx={{ fontSize: 16, mr: 0.375 }}
                                  />
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
                        </Collapse>
                      </Box>
                    </Fade>

                    <Collapse
                      in={
                        (!shouldDisplayCard && !animatingIn) || suggestionsError
                      }
                      onEntered={() => setAnimatingOut(false)}
                      onExited={() => {
                        if (animatingIn) {
                          selectAddress(animatingIn);
                        }
                      }}
                    >
                      <Box sx={{ display: "flex", gap: 1.5 }}>
                        <Autocomplete
                          onFocus={() => setAutocompleteFocused(true)}
                          onBlur={() => setAutocompleteFocused(false)}
                          getOptionLabel={getOptionLabel}
                          options={suggestions}
                          popupIcon={null}
                          onInputChange={(_event, newInputValue) => {
                            if (newInputValue.trim() !== "") {
                              fetchSuggestions(newInputValue);
                            }
                          }}
                          onChange={(_event, option) => {
                            if (typeof option === "object") {
                              setAnimatingIn(option);
                            }
                          }}
                          filterOptions={(options) => options}
                          inputPlaceholder={inputPlaceholder}
                          inputProps={{
                            endAdornment: suggestionsError ? (
                              <TriangleExclamationIcon
                                sx={{
                                  fontSize: 14,
                                  fill: ({ palette }) => palette.red[70],
                                }}
                              />
                            ) : suggestionsLoading ? (
                              <CircularProgress size={14} />
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
                                    color: ({ palette }) =>
                                      palette.common.black,
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
                          componentsProps={{
                            paper: {
                              sx: {
                                padding: "0 !important",
                                filter:
                                  "drop-shadow(0px 11px 30px rgba(61, 78, 133, 0.04)) drop-shadow(0px 7.12963px 18.37px rgba(61, 78, 133, 0.05)) drop-shadow(0px 4.23704px 8.1px rgba(61, 78, 133, 0.06)) drop-shadow(0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07))",
                                border: ({ palette }) =>
                                  `1px solid ${palette.gray[20]}`,
                                boxShadow: "none",
                                [`.${autocompleteClasses.listbox}`]: {
                                  padding: "0px",
                                  maxHeight: "unset",
                                  [`.${autocompleteClasses.option}`]: {
                                    alignItems: "flex-start",
                                    paddingX: ({ spacing }) =>
                                      `${spacing(2.5)} !important`,
                                    paddingY: 1.25,
                                    marginY: 0,
                                  },
                                },
                              },
                            },
                          }}
                          sx={{
                            width: 1,
                            maxWidth: INPUT_MAX_WIDTH,
                            [`.${autocompleteClasses.input}`]: {
                              paddingLeft: "0 !important",
                              fontSize: 16,
                              // Override WP Input styles
                              lineHeight: "24px",
                              minHeight: "unset",
                              border: "none",
                              boxShadow: "none !important",
                            },
                            [`.${autocompleteClasses.inputRoot}`]: {
                              paddingX: ({ spacing }) =>
                                `${spacing(2.75)} !important`,
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
                              Check your network connection or contact support
                              if this issue persists.
                            </Typography>
                          </Box>
                        ) : null}
                      </Box>
                    </Collapse>
                  </>
                ) : null}

                <Collapse
                  in={shouldDisplayCard && !animatingOut && !suggestionsError}
                  onEntered={() => setAnimatingIn(null)}
                >
                  {displayFullAddress ? (
                    <AddressCard
                      isMobile={isMobile}
                      title={displayTitle}
                      description={description}
                      fullAddress={displayFullAddress}
                      mapUrl={mapUrl}
                      mapError={mapError}
                      hovered={hovered}
                      readonly={readonly}
                      onClose={() => {
                        setAnimatingOut(true);
                        setTimeout(() => {
                          void resetBlock();
                        }, 300);
                      }}
                      updateTitle={updateTitle}
                      updateDescription={updateDescription}
                      incrementZoomLevel={
                        zoomLevel >= MAX_ZOOM_LEVEL
                          ? undefined
                          : incrementZoomLevel
                      }
                      decrementZoomLevel={
                        zoomLevel <= MIN_ZOOM_LEVEL
                          ? undefined
                          : decrementZoomLevel
                      }
                    />
                  ) : (
                    <AddressCardLoading isMobile={isMobile} />
                  )}
                </Collapse>
              </Box>
            );
          }}
        </SizeMe>
      </ThemeProvider>
    </>
  );
};
