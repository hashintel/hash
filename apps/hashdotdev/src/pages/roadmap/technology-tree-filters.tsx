import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Checkbox,
  FormControlLabel,
  formControlLabelClasses,
  IconButton,
  styled,
  Typography,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { ArrowRightLineRegularIcon } from "../../components/icons/arrow-right-line-regular-icon";
import { FontAwesomeIcon } from "../../components/icons/font-awesome-icon";
import type { StatusId } from "./statuses";
import { statuses } from "./statuses";
import type { UseCaseId } from "./use-cases";
import { useCases } from "./use-cases";
import type { VariantId } from "./variants";
import { variants } from "./variants";

const FilterHeadingTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  marginBottom: theme.spacing(0.75),
}));

const FilterHeading: FunctionComponent<{
  children: ReactNode;
  togglingAll: boolean;
  setTogglingAll: (togglingAll: boolean) => void;
}> = ({ children, togglingAll, setTogglingAll }) => {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
      <FilterHeadingTypography>{children}</FilterHeadingTypography>
      <FormControlLabel
        sx={{
          position: "relative",
          top: -2,
          marginX: 0,
          [`.${formControlLabelClasses.label}`]: {
            color: ({ palette }) =>
              togglingAll ? palette.black : palette.gray[80],
            fontSize: 12,
            fontWeight: 600,
          },
        }}
        control={
          <Checkbox
            checked={togglingAll}
            onChange={({ target }) => setTogglingAll(target.checked)}
          />
        }
        label="Toggle All"
      />
    </Box>
  );
};

const FilterCheckboxItem: FunctionComponent<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  label: ReactNode;
  color?: string;
}> = ({ checked, onChange, icon, label, color }) => (
  <FormControlLabel
    sx={{
      display: "flex",
      marginLeft: 0,
      marginRight: 0,
      marginBottom: 0.75,
      [`.${formControlLabelClasses.label}`]: {
        "> svg": {
          color: ({ palette }) =>
            color ?? (checked ? palette.black : palette.gray[80]),
          minWidth: 20,
          fontSize: 14,
        },
        marginLeft: 1,
        display: "flex",
        alignItems: "center",
      },
    }}
    control={
      <Checkbox
        checked={checked}
        onChange={({ target }) => onChange(target.checked)}
      />
    }
    label={
      <>
        {icon}
        <Typography
          marginLeft={1}
          sx={{
            color: ({ palette }) =>
              color ?? (checked ? palette.black : palette.gray[80]),
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {label}
        </Typography>
      </>
    }
  />
);

export const TechnologyTreeFilters: FunctionComponent<{
  open: boolean;
  isWideScreen: boolean;
  displayedStatuses: StatusId[];
  setDisplayedStatuses: (displayedStatuses: StatusId[]) => void;
  displayedVariants: VariantId[];
  setDisplayedVariants: (displayedVariants: VariantId[]) => void;
  displayedUseCases: UseCaseId[];
  setDisplayedUseCases: (displayedUseCases: UseCaseId[]) => void;
  onClose: () => void;
}> = ({
  open,
  isWideScreen,
  displayedStatuses,
  setDisplayedStatuses,
  displayedVariants,
  setDisplayedVariants,
  displayedUseCases,
  setDisplayedUseCases,
  onClose,
}) => {
  return (
    <Box
      sx={{
        zIndex: isWideScreen ? 0 : 2,
        position: "absolute",
        right: 0,
        top: isWideScreen ? 0 : 4,
        transform: ({ spacing }) =>
          isWideScreen
            ? open
              ? `translateX(calc(100% - ${spacing(0.5)}))`
              : "translateX(0%)"
            : open
              ? "translateX(0%)"
              : "translateX(100%)",
        height: isWideScreen ? "100%" : "unset",
        maxHeight: ({ spacing }) =>
          isWideScreen ? "unset" : `calc(100% - ${spacing(4)})`,
        transition: ({ transitions }) => transitions.create("transform"),
        py: 3,
        paddingLeft: isWideScreen ? 3.25 : 3.5,
        paddingRight: 1.75,
        borderBottomLeftRadius: isWideScreen ? "0px" : "8px",
        borderTopRightRadius: isWideScreen ? "8px" : "0px",
        borderBottomRightRadius: isWideScreen ? "8px" : "0px",
        background: ({ palette }) => palette.white,
        borderWidth: 1,
        borderColor: ({ palette }) => palette.gray[20],
        borderStyle: "solid",
        borderTopWidth: isWideScreen ? 1 : 0,
        borderRightWidth: isWideScreen ? 1 : 0,
        borderLeftWidth: isWideScreen ? 0 : 1,
        overflowY: "auto",
      }}
    >
      <Box display="flex" justifyContent="space-between" marginBottom={2}>
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[90],
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Filters
        </Typography>
        <IconButton
          onClick={() => onClose()}
          sx={{
            padding: 0.5,
            svg: {
              fontSize: 16,
              color: ({ palette }) => palette.gray[50],
            },
          }}
        >
          {isWideScreen ? (
            <FontAwesomeIcon icon={faClose} />
          ) : (
            <ArrowRightLineRegularIcon
              sx={{ fontSize: 15, marginRight: 1.5, marginTop: -0.5 }}
            />
          )}
        </IconButton>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          rowGap: 2,
        }}
      >
        <Box>
          <FilterHeading
            togglingAll={displayedStatuses.length === statuses.length}
            setTogglingAll={(togglingAll) =>
              togglingAll
                ? setDisplayedStatuses(statuses.map(({ id }) => id))
                : setDisplayedStatuses([])
            }
          >
            By Status
          </FilterHeading>
          {statuses.map(({ id, name, icon, filterColor }) => (
            <FilterCheckboxItem
              key={id}
              checked={displayedStatuses.includes(id)}
              onChange={(checked) =>
                setDisplayedStatuses(
                  checked
                    ? [...displayedStatuses, id]
                    : displayedStatuses.filter((statusId) => statusId !== id),
                )
              }
              label={name}
              icon={icon}
              color={filterColor}
            />
          ))}
        </Box>
        <Box>
          <FilterHeading
            togglingAll={displayedVariants.length === variants.length}
            setTogglingAll={(togglingAll) =>
              togglingAll
                ? setDisplayedVariants(variants.map(({ id }) => id))
                : setDisplayedVariants([])
            }
          >
            By Type
          </FilterHeading>
          {variants.map(({ id, name, icon }) => (
            <FilterCheckboxItem
              key={id}
              checked={displayedVariants.includes(id)}
              onChange={(checked) =>
                setDisplayedVariants(
                  checked
                    ? [...displayedVariants, id]
                    : displayedVariants.filter((statusId) => statusId !== id),
                )
              }
              label={name}
              icon={icon}
            />
          ))}
        </Box>
        <Box>
          <FilterHeading
            togglingAll={displayedUseCases.length === useCases.length}
            setTogglingAll={(togglingAll) =>
              togglingAll
                ? setDisplayedUseCases(useCases.map(({ id }) => id))
                : setDisplayedUseCases([])
            }
          >
            By Area
          </FilterHeading>
          {useCases.map(({ id, name, icon }) => (
            <FilterCheckboxItem
              key={id}
              checked={displayedUseCases.includes(id)}
              onChange={(checked) =>
                setDisplayedUseCases(
                  checked
                    ? [...displayedUseCases, id]
                    : displayedUseCases.filter((statusId) => statusId !== id),
                )
              }
              label={name}
              icon={icon}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
};
