import {
  type BlockComponent,
  useGraphBlockService,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { useEffect, useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import styles from "./base.module.scss";

import Autocomplete, { autocompleteClasses } from "@mui/material/Autocomplete";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapbox } from "./useMapbox";
import SearchIcon from "@mui/icons-material/Search";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import {
  CircularProgress,
  Collapse,
  styled,
  textFieldClasses,
  Typography,
} from "@mui/material";
import { CircleQuestionIcon } from "./icons/circle-question-icon";
import { MapboxIcon } from "./icons/mapbox-icon";
import { AutofillSuggestion } from "@mapbox/search-js-core";
import Stack from "@mui/material/Stack";
import Paper, { paperClasses } from "@mui/material/Paper";
import { AddressCard } from "./address-card";
import Fade from "@mui/material/Fade";
import isEqual from "lodash.isequal";
import { Address, RootEntity } from "./types.gen";

const addressTypeId =
  "https://alpha.hash.ai/@luisbett/types/entity-type/address/v/1";
const linkTypeId =
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";

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

const popperPositionDataAttribute = "data-popper-placement";

const popperPlacementSelectors = {
  top: `[${popperPositionDataAttribute}="top"]`,
  bottom: `[${popperPositionDataAttribute}="bottom"]`,
  topStart: `[${popperPositionDataAttribute}="top-start"]`,
  topEnd: `[${popperPositionDataAttribute}="top-end"]`,
  bottomStart: `[${popperPositionDataAttribute}="bottom-start"]`,
  bottomEnd: `[${popperPositionDataAttribute}="bottom-end"]`,
};

export const popperPlacementInputNoRadius: SystemStyleObject<Theme> = {
  [`&${popperPlacementSelectors.bottom}, &${popperPlacementSelectors.bottomStart}, ${popperPlacementSelectors.bottom} &, ${popperPlacementSelectors.bottomStart} &`]:
    {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  [`&${popperPlacementSelectors.top}, &${popperPlacementSelectors.topStart}, ${popperPlacementSelectors.top} &, ${popperPlacementSelectors.topStart} &`]:
    {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
};

export const popperPlacementInputNoBorder: SystemStyleObject<Theme> = {
  [`&${popperPlacementSelectors.bottom}`]: {
    borderBottom: 0,
  },
  [`&${popperPlacementSelectors.top}`]: {
    borderTop: 0,
  },
};

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

const DropdownTitleTypography = styled(Typography)(() => ({
  display: "flex",
  fontFamily: "Inter",
  fontWeight: 500,
  fontSize: "14px !important",
  lineHeight: "18px",
  color: "#000000",
  marginBottom: "4px !important",
}));

const DropdownSubtitleTypography = styled(Typography)(() => ({
  display: "flex",
  fontFamily: "Inter",
  fontWeight: 400,
  fontSize: "13px !important",
  lineHeight: "18px",
  color: "#91A5BA",
  marginBottom: "0 !important",
}));

type BlockEntityProperties = {
  label: string;
  fullAddress: string;
  mapUrl: string;
  description: string;
};

const accessToken =
  "pk.eyJ1IjoibHVpc2JldHRlbmNvdXJ0IiwiYSI6ImNsZGl2ZXdvODBuY2YzcW1lb3N5bng4NTQifQ.HW1cG865jlptDTbJBNwhQw";

const getOptionLabel = (option: AutofillSuggestion | string) =>
  typeof option === "string" ? option : option.place_name ?? "";

export function Component({
  address,
  updateAddress,
  updateTitle,
  updateDescription,
}: {
  title?: string;
  description?: string;
  address?: Address;
  updateAddress: (address?: Address) => void;
  updateTitle: (title: string) => void;
  updateDescription: (description: string) => void;
}) {
  const {
    suggestions,
    suggestionsLoading,
    suggestionsError,
    fetchSuggestions,
    selectAddress,
    selectedAddress,
  } = useMapbox(accessToken);

  const displayedAddress = address?.label ? address : selectedAddress;

  useEffect(() => {
    if (selectedAddress) {
      updateAddress(selectedAddress);
    } else {
      updateAddress();
    }
  }, [selectedAddress]);

  const [autocompleteFocused, setAutocompleteFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  return (
    <Box
      sx={{ fontFamily: "Inter" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Collapse
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
            {!displayedAddress ? (
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
      </Collapse>

      <Collapse
        in={!displayedAddress && !animatingIn}
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
          // onSelect={(_event, option) => {
          // }}
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
                  // sx: [
                  //   ...[
                  //     popperPlacementInputNoRadius,
                  //     popperPlacementInputNoBorder,
                  //     { borderRadius: "0 !important", boxShadow: "none" },
                  //   ],
                  // ],
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
                <DropdownTitleTypography>{label}</DropdownTitleTypography>
                <DropdownSubtitleTypography>
                  {option.country}
                </DropdownSubtitleTypography>
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

                // [`${popperPlacementSelectors.top} &`]: {
                //   borderBottom: 0,
                //   borderBottomLeftRadius: 0,
                //   borderBottomRightRadius: 0,
                // },
                // [`${popperPlacementSelectors.topStart} &`]: {
                //   borderBottom: 0,
                //   borderBottomLeftRadius: 0,
                // },
                // [`${popperPlacementSelectors.bottom} &`]: {
                //   borderTop: 0,
                //   borderTopLeftRadius: 0,
                //   borderTopRightRadius: 0,
                // },
                // [`${popperPlacementSelectors.bottomStart} &`]: {
                //   borderTop: 0,
                //   borderTopLeftRadius: 0,
                // },
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
        in={!!displayedAddress && !animatingOut}
        onEntered={() => setAnimatingIn(false)}
      >
        {displayedAddress ? (
          <AddressCard
            label="test"
            address={displayedAddress}
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

      {/* {selectedAddress ? (
        <Map
          initialViewState={{
            longitude: selectedAddress.coordinates[0],
            latitude: selectedAddress.coordinates[1],
            zoom: 14,
          }}
          style={{ width: 600, height: 400 }}
          mapboxAccessToken={accessToken}
          mapStyle="mapbox://styles/mapbox/streets-v9"
        />
      ) : null} */}
    </Box>
  );
}

export const App: BlockComponent<RootEntity> = ({
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
      editionId: { baseId: entityId },
      entityTypeId,
    },
    properties,
    // : {
    //   [captionKey]: caption,
    //   [contentKey]: content,
    //   [languageKey]: language,
    // },
  } = blockEntity;

  console.log(blockEntity);
  console.log(linkedEntities);
  console.log(entityId);

  // // console.log(rootEntity);

  // // const [draftAddress, setDraftAddress] = useState<Address>(properties);
  // // const [prevProperties, setPrevProperties] = useState(properties);

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

  const updateAddress = async (address?: Address) => {
    // if (address.file) {
    //   graphService
    //     ?.uploadFile({
    //       data: { file: address.file, mediaType: "image" },
    //     })
    //     .then(async (res) => {
    //       console.log(res);
    // });
    // }
    if (readonly || !address) {
      return;
    }

    //   const createAddressEntityResponse = await graphService?.createEntity({
    //     data: {
    //       entityTypeId: addressTypeId,
    //       properties: {
    //         [localityKey]: "1",
    //         [regionKey]: "2",
    //         [postalCodeKey]: "3",
    //         [streetKey]: "4",
    //       },
    //     },
    //   });

    //   const addressEntityId =
    //     createAddressEntityResponse?.data?.metadata.editionId.baseId;
    //   if (addressEntityId) {
    //     const createLinkResponse = await graphService?.createEntity({
    //       data: {
    //         entityTypeId:
    //           "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
    //         properties: {},
    //         linkData: {
    //           leftEntityId: entityId,
    //           rightEntityId: addressEntityId,
    //         },
    //       },
    //     });
    //   }
  };

  // //   useEffect(() =>   {
  // //     if (properties !== prevProperties) {
  // //     setPrevProperties(properties);

  // //     if (!isEqual(properties, draftProperties)) {
  // //       setDraftAddress(items);
  // //     }
  // //   }
  // // }, [])

  // const address = {
  //   label:
  //     properties[
  //       "http://localhost:3000/@system-user/types/property-type/label/"
  //     ],
  //   fullAddress:
  //     properties[
  //       "http://localhost:3000/@system-user/types/property-type/fullAddress/"
  //     ],
  //   description:
  //     properties[
  //       "http://localhost:3000/@system-user/types/property-type/description/"
  //     ],
  //   mapUrl:
  //     properties[
  //       "http://localhost:3000/@system-user/types/property-type/mapUrl/"
  //     ],
  //   coordinates:
  //     properties[
  //       "http://localhost:3000/@system-user/types/property-type/coordinates/"
  //     ],
  // }

  const address = {};

  // const updateAddress = () => {};

  return (
    <div className={styles.block} ref={blockRootRef}>
      <Component
        address={address}
        updateAddress={updateAddress}
        updateTitle={updateTitle}
        updateDescription={updateDescription}
      />
    </div>
  );
};
