import {
  type BlockComponent,
  // useGraphBlockService,
} from "@blockprotocol/graph/react";
import { useEffect, useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import styles from "./base.module.scss";
import {
  SessionToken,
  AutofillSuggestion,
  AutofillFeatureSuggestion,
  AutofillSuggestionResponse,
  AutofillRetrieveResponse,
} from "@mapbox/search-js-core";
import Autocomplete from "@mui/material/Autocomplete";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapbox } from "./useMapbox";
import SearchIcon from "@mui/icons-material/Search";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import { Typography } from "@mui/material";
import { CircleQuestionIcon } from "./icons/circle-question-icon";
import { MapboxIcon } from "./icons/mapbox-icon";

type BlockEntityProperties = {
  name: string;
};

const accessToken =
  "pk.eyJ1IjoibHVpc2JldHRlbmNvdXJ0IiwiYSI6ImNsZGl2ZXdvODBuY2YzcW1lb3N5bng4NTQifQ.HW1cG865jlptDTbJBNwhQw";

export function Component() {
  const {
    suggestions,
    suggestionsLoading,
    suggestionsError,
    fetchSuggestions,
    selectAddress,
    mapUrl,
  } = useMapbox(accessToken);

  return (
    <Box>
      <Box>
        <Tooltip title="Get help">
          <Typography
            sx={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: "15px !important",
              lineHeight: 1,
              color: "#91A5BA",
              letterSpacing: -0.02,
              fontFamily: "Inter",
            }}
          >
            Get help{" "}
            <CircleQuestionIcon sx={{ fontSize: 16, ml: 1, mr: 0.375 }} />
          </Typography>
        </Tooltip>

        <Typography
          sx={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: "15px !important",
            lineHeight: 1,
            color: "#91A5BA",
            letterSpacing: -0.02,
            fontFamily: "Inter",
            ml: 3,
          }}
        >
          Using
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              color: "#758AA1",
            }}
          >
            <MapboxIcon sx={{ fontSize: 16, ml: 1, mr: 0.375 }} />
            Mapbox Address Autofill{" "}
          </Box>
          and{" "}
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              color: "#758AA1",
            }}
          >
            <MapboxIcon sx={{ fontSize: 16, ml: 1, mr: 0.375 }} />
            Mapbox Static Images
          </Box>
        </Typography>
      </Box>
      <Autocomplete
        id="mapbox-demo"
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.place_name ?? ""
        }
        disablePortal
        options={suggestions}
        popupIcon={null}
        onInputChange={(event, newInputValue) => {
          fetchSuggestions(newInputValue);
        }}
        onChange={(event, option) => {
          if (option) {
            selectAddress(option.action.id);
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
                endAdornment: (
                  <SearchIcon sx={{ color: "#C1CFDE" }} />
                  // <InputAdornment position="end">
                  //   {InputProps.endAdornment}
                  // </InputAdornment>
                ),
              }}
            />
          );
        }}

        // renderOption={(props, option, state) => {
        //   console.log(state);
        //   const label = getOptionLabel(option);
        //   return (
        //     <li {...props}>
        //       <Typography variant="body2" color="text.secondary">
        //         {label}
        //       </Typography>
        //     </li>
        //   );
        // }}
      />

      {mapUrl ? <img alt="" src={mapUrl} /> : null}

      {/* {selectedLocation ? (
        <Map
          initialViewState={{
            longitude: selectedLocation.geometry.coordinates[0],
            latitude: selectedLocation.geometry.coordinates[1],
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

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  // const { graphService } = useGraphBlockService(blockRootRef);

  // const { name } = properties;

  return (
    <div className={styles.block} ref={blockRootRef}>
      <Component />
    </div>
  );
};
