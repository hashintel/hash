import { TextField } from "@hashintel/design-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  Box,
  BoxProps,
  InputAdornment,
  inputAdornmentClasses,
  Typography,
  typographyClasses,
} from "@mui/material";
import { FunctionComponent, ReactNode, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { SelectInput } from "../../components/forms/select-input";
import { useShortnameInput } from "../../components/hooks/use-shortname-input";
import { ChevronRightRegularIcon } from "../../shared/icons/chevron-right-regular-icon";
import { CircleRegularInfoIcon } from "../../shared/icons/circle-info-regular-icon";
import { TriangleExclamationRegularIcon } from "../../shared/icons/triangle-exclamation-regular-icon";
import { Button } from "../../shared/ui";
import { InvitationInfo, ORG_ROLES } from "../shared/auth-utils";

const inputWidth = 250;

const InputLabel: FunctionComponent<
  {
    label: ReactNode;
    description: ReactNode;
  } & BoxProps<"label">
> = ({ label, description, sx, ...labelProps }) => {
  return (
    <Box
      component="label"
      {...labelProps}
      sx={[
        {
          display: "block",
          marginBottom: 1.5,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography
        sx={{
          color: ({ palette }) => palette.common.black,
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color: "rgba(0, 0, 0, 0.66)",
          fontSize: 13,
        }}
      >
        {description}
      </Typography>
    </Box>
  );
};

type AccountSetupFormProps = {
  onSubmit: (details: { shortname: string; preferredName: string }) => void;
  loading: boolean;
  errorMessage?: string;
  email: string;
  invitationInfo: InvitationInfo | null;
};

type FormData = {
  shortname: string;
  preferredName: string;
  responsibility?: string;
};

export const AccountSetupForm: FunctionComponent<AccountSetupFormProps> = ({
  onSubmit: setupAccount,
  loading,
  errorMessage,
  email,
  invitationInfo,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isValid, touchedFields },
  } = useForm<FormData>({
    mode: "all",
    defaultValues: {
      shortname: "",
      preferredName: "",
      responsibility: undefined,
    },
  });

  const shortnameWatcher = watch("shortname", "");
  const preferredNameWatcher = watch("preferredName", "");
  const responsibilityWatcher = watch("responsibility", "");

  const { validateShortname, parseShortnameInput, getShortnameError } =
    useShortnameInput();

  const onSubmit = handleSubmit(
    ({ shortname, preferredName, responsibility }) => {
      setupAccount({
        shortname,
        preferredName,
        ...(!!invitationInfo && { responsibility }),
      });
    },
  );

  const [title, subtitle] = useMemo(() => {
    if (invitationInfo) {
      return [
        "inviterPreferredName" in invitationInfo
          ? `${invitationInfo.inviterPreferredName} has invited you to join ${invitationInfo.orgName} on HASH`
          : `You have been invited to join ${invitationInfo.orgName} on HASH`,
        `${email} has been confirmed. Now it’s time to set your name...`,
      ];
    }

    return [
      "Thanks for confirming your account",
      "Now it’s time to set your name...",
    ];
  }, [invitationInfo, email]);

  const shortnameError = getShortnameError(
    errors.shortname?.message,
    Boolean(touchedFields.shortname),
  );

  return (
    <Box>
      <Typography
        sx={{
          color: ({ palette }) => palette.common.black,
          fontWeight: 700,
          fontSize: 32,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          color: ({ palette }) => palette.common.black,
          fontSize: 24,
        }}
      >
        {subtitle}
      </Typography>
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          marginTop: 6,
          display: "flex",
          flexDirection: "column",
          rowGap: 4,
        }}
      >
        <Box>
          <InputLabel
            htmlFor="name"
            label={
              <>
                Preferred name{" "}
                <Box component="span" sx={{ fontWeight: "400" }}>
                  or first name
                </Box>
              </>
            }
            description={
              <>
                What shall we call you when referring to you? e.g. “Hi,{" "}
                <Box
                  component="strong"
                  sx={{
                    color: "#000000",
                    opacity: 1,
                    textTransform: "capitalize",
                  }}
                >
                  {preferredNameWatcher || "Bobby"}
                </Box>
                ”
              </>
            }
          />
          <TextField
            id="name"
            placeholder="Bobby"
            sx={{ width: inputWidth }}
            {...register("preferredName", { required: true })}
          />
        </Box>
        <Box>
          <InputLabel
            htmlFor="shortname"
            label={
              <>
                Personal Username{" "}
                <Box
                  component="span"
                  sx={{
                    marginLeft: 2,
                    color: ({ palette }) => palette.blue[70],
                  }}
                >
                  Once set this Cannot be changed{" "}
                  <TriangleExclamationRegularIcon sx={{ fontSize: 13 }} />
                </Box>
              </>
            }
            description={
              <>
                Your own personal graph will exist under this username. e.g.{" "}
                {frontendUrl}/
                <Box
                  component="strong"
                  sx={{
                    color: ({ palette }) => palette.common.black,
                    fontWeight: 700,
                  }}
                >
                  @{shortnameWatcher || "example"}
                </Box>
              </>
            }
          />
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Controller
              control={control}
              name="shortname"
              rules={{ validate: validateShortname }}
              render={({ field }) => (
                <TextField
                  id="shortname"
                  {...field}
                  onChange={(evt) => {
                    const newEvt = { ...evt };
                    newEvt.target.value = parseShortnameInput(
                      newEvt.target.value,
                    );
                    field.onChange(newEvt);
                  }}
                  autoFocus
                  placeholder="example"
                  autoComplete="off"
                  sx={{ width: inputWidth }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment
                        position="start"
                        sx={{
                          [`&.${inputAdornmentClasses.root}.${inputAdornmentClasses.positionStart}`]:
                            {
                              marginRight: -0.5,
                              [`& .${typographyClasses.root}`]: {
                                color: "rgba(14, 17, 20, 0.33)",
                              },
                            },
                        }}
                      >
                        @
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                columnGap: 1.5,
                borderRadius: "8px",
                borderColor: shortnameError
                  ? "#FCA5A5"
                  : "rgba(36, 130, 255, 0.40)",
                borderWidth: 1,
                borderStyle: "solid",
                maxWidth: 350,
                transitionProperty: "opacity",
                padding: 1.5,
                marginLeft: 2,
              }}
            >
              <CircleRegularInfoIcon
                sx={{
                  color: shortnameError ? "#FCA5A5" : "#2482FF",
                  fontSize: 16,
                }}
              />
              <Typography
                sx={{
                  flex: "1 1 0%",
                  ...(shortnameError
                    ? {
                        color: "#EF4444",
                        fontSize: 13,
                        lineHeight: "1.25rem",
                      }
                    : {
                        color: ({ palette }) => palette.common.black,
                        textOpacity: "0.6",
                        fontSize: 12,
                        lineHeight: "1rem",
                      }),
                }}
              >
                {shortnameError ?? (
                  <>
                    If you’re using HASH for work or a team, you’ll be able to
                    choose a separate org username later.
                  </>
                )}
              </Typography>
            </Box>
          </Box>
        </Box>

        {!!invitationInfo && (
          <Box style={{ marginTop: 2 }}>
            <Controller
              control={control}
              name="responsibility"
              rules={{ required: true }}
              render={({ field: { onChange, value } }) => (
                <SelectInput
                  className="w-64"
                  label={`Your Role at ${invitationInfo.orgName}`}
                  labelClass="font-bold text-base mb-4"
                  id="responsibility"
                  options={ORG_ROLES}
                  onChange={onChange}
                  value={value}
                />
              )}
            />
            {errorMessage ? (
              <Typography
                sx={{
                  marginTop: "1.25rem",
                  color: "#EF4444",
                  fontSize: "0.875rem",
                  lineHeight: "1.25rem",
                }}
              >
                {errorMessage}
              </Typography>
            ) : null}
          </Box>
        )}
        <Button
          type="submit"
          disabled={
            !isValid || loading || (!!invitationInfo && !responsibilityWatcher)
          }
          loading={loading}
          endIcon={<ChevronRightRegularIcon />}
          sx={{ width: inputWidth }}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
};
