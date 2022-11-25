import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import { Autocomplete, Box, Stack, Typography } from "@mui/material";
import { FunctionComponent } from "react";
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import { PropertyType } from "./custom-property-type-menu";
import { propertyTypeDataTypes } from "./property-type-form";

type ArrayPropertyTypeMenuProps = {
  property: PropertyType;
  setProperty: (prop: PropertyType) => void;
};

export const ArrayPropertyTypeMenu: FunctionComponent<
  ArrayPropertyTypeMenuProps
> = ({}) => {
  const arrayPropertyTypeDataTypes = [
    ...propertyTypeDataTypes,
    {
      // title: types.dataType.object.title,
      title: "Array",
      icon: faList.icon,
      dataTypeId: types.dataType.object.dataTypeId,
    },
    {
      // title: types.dataType.object.title,
      title: "Property Object",
      icon: faCube,
      dataTypeId: types.dataType.object.dataTypeId,
    },
  ];

  return (
    <Stack>
      <Stack
        direction="row"
        sx={{
          flex: 1,
          background: ({ palette }) => palette.gray[70],
          borderTopRightRadius: 4,
          borderTopLeftRadius: 4,
          paddingY: 1,
          paddingX: 1.5,
          alignItems: "center",
        }}
      >
        <FontAwesomeIcon
          icon={faList}
          sx={{ color: ({ palette }) => palette.gray[40], marginRight: 1.5 }}
        />
        <Typography sx={{ color: ({ palette }) => palette.white }}>
          Array
        </Typography>
      </Stack>

      <Box
        sx={{
          padding: 1.5,
          flex: 1,
          background: ({ palette }) => palette.gray[10],
          borderBottomRightRadius: 4,
          borderBottomLeftRadius: 4,
          position: "relative",
        }}
      >
        <Autocomplete
          multiple
          popupIcon={null}
          clearIcon={null}
          forcePopupIcon={false}
          selectOnFocus={false}
          openOnFocus
          clearOnBlur={false}
          // onChange={(_evt, data) => {
          //   onChange(data);
          // }}
          // {...props}
          // PaperComponent={PropertyTypeSelectorDropdown}

          // renderTags={(value, getTagProps) =>
          //   value.map((option, index) => (
          //     <Chip
          //       {...getTagProps({ index })}
          //       key={option.dataTypeId}
          //       label={
          //         <Typography
          //           variant="smallTextLabels"
          //           sx={{ display: "flex", alignItems: "center" }}
          //         >
          //           <FontAwesomeIcon
          //             icon={{ icon: option.icon }}
          //             sx={{ fontSize: "1em", mr: "1ch" }}
          //           />
          //           {option.title}
          //         </Typography>
          //       }
          //       color="blue"
          //     />
          //   ))
          // }
          renderInput={(inputProps) => (
            <TextField
              {...inputProps}
              sx={{
                alignSelf: "flex-start",
                width: "70%",
              }}
              placeholder="Select acceptable values"
            />
          )}
          options={arrayPropertyTypeDataTypes}
          getOptionLabel={(obj) => obj.title}
          disableCloseOnSelect
          disablePortal
          renderOption={(optProps, opt) => (
            <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
              <FontAwesomeIcon
                icon={{ icon: opt.icon }}
                sx={(theme) => ({ color: theme.palette.gray[50] })}
              />
              <Typography
                variant="smallTextLabels"
                component="span"
                ml={1.5}
                color={(theme) => theme.palette.gray[80]}
              >
                {opt.title}
              </Typography>
              <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
            </Box>
          )}
          componentsProps={{
            popper: {
              sx: { width: "100% !important" },
              placement: "bottom-start",
            },
          }}
        />
      </Box>
    </Stack>
  );
};
