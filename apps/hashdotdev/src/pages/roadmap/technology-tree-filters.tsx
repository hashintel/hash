import {
  Box,
  Checkbox,
  FormControlLabel,
  formControlLabelClasses,
  IconButton,
  styled,
  Theme,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { FunctionComponent, ReactNode, useEffect, useState } from "react";

import { FaIcon } from "../../components/icons/fa-icon";
import { statuses, StatusId } from "./statuses";
import { UseCaseId, useCases } from "./use-cases";
import { VariantId, variants } from "./variants";

const FilterHeading = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
}));

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
      marginBottom: -1,
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
  isWideScreen: boolean;
  displayedStatuses: StatusId[];
  setDisplayedStatuses: (displayedStatuses: StatusId[]) => void;
  displayedVariants: VariantId[];
  setDisplayedVariants: (displayedVariants: VariantId[]) => void;
  displayedUseCases: UseCaseId[];
  setDisplayedUseCases: (displayedUseCases: UseCaseId[]) => void;
}> = ({
  isWideScreen,
  displayedStatuses,
  setDisplayedStatuses,
  displayedVariants,
  setDisplayedVariants,
  displayedUseCases,
  setDisplayedUseCases,
}) => {
  const isMobile = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md"),
  );

  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        sx={{
          position: "absolute",
          zIndex: 2,
          top: ({ spacing }) => spacing(2),
          right: ({ spacing }) => spacing(2),
          transition: ({ transitions }) => transitions.create("opacity"),
          opacity: open ? 0 : 1,
          background: ({ palette }) => palette.white,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderWidth: 1,
          borderRadius: "4px",
        }}
      >
        <FaIcon
          name="filter"
          type="regular"
          sx={{
            fontSize: 14,
            color: ({ palette }) => palette.gray[50],
          }}
        />
      </IconButton>
      <Box
        sx={{
          zIndex: isWideScreen ? 0 : 2,
          position: "absolute",
          right: 0,
          top: ({ spacing }) => (isWideScreen ? 0 : spacing(2)),
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
          py: isWideScreen ? 3 : 1.5,
          paddingLeft: isWideScreen ? 3.25 : 1.75,
          paddingRight: 1.75,
          borderTopLeftRadius: isWideScreen ? "0px" : "8px",
          borderBottomLeftRadius: isWideScreen ? "0px" : "8px",
          borderTopRightRadius: isWideScreen ? "8px" : "0px",
          borderBottomRightRadius: isWideScreen ? "8px" : "0px",
          background: ({ palette }) => palette.white,
          borderWidth: 1,
          borderColor: ({ palette }) => palette.gray[20],
          borderStyle: "solid",
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
          <IconButton onClick={() => setOpen(false)} sx={{ padding: 0.5 }}>
            <FaIcon
              name="close"
              type="regular"
              sx={{
                fontSize: 16,
                color: ({ palette }) => palette.gray[50],
              }}
            />
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
            <FilterHeading>By Status</FilterHeading>
            {statuses.map(({ id, name, icon, color }) => (
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
                color={color}
              />
            ))}
          </Box>
          <Box>
            <FilterHeading>By Type</FilterHeading>
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
            <FilterHeading>By Use Case</FilterHeading>
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
    </>
  );
};
