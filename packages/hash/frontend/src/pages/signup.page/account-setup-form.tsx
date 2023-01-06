import { Box } from "@mui/material";
import { FunctionComponent, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { SelectInput } from "../../components/forms/select-input";
import { useShortnameInput } from "../../components/hooks/use-shortname-input";
import { InfoIcon, LogoIcon, SpinnerIcon } from "../../shared/icons";
import { InvitationInfo, ORG_ROLES } from "../shared/auth-utils";

type AccountSetupFormProps = {
  onSubmit: (details: {
    shortname: string;
    preferredName: string;
    responsibility?: string;
  }) => void;
  loading: boolean;
  errorMessage?: string;
  email: string;
  invitationInfo: InvitationInfo | null;
};

type Inputs = {
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
  } = useForm<Inputs>({
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
        `${email} has been confirmed. Now it's time to choose a username...`,
      ];
    }

    return [
      "Thanks for confirming your account",
      "Now it's time to choose a username...",
    ];
  }, [invitationInfo, email]);

  const shortnameError = getShortnameError(
    errors.shortname?.message,
    Boolean(touchedFields.shortname),
  );

  return (
    <div style={{ width: "75%", maxWidth: "48rem" }}>
      <LogoIcon style={{ marginBottom: "4rem" }} />
      <div style={{ marginBottom: "2.25rem" }}>
        <h1
          style={{
            fontSize: "1.875rem",
            fontWeight: "700",
            lineHeight: "2.25rem",
            marginBottom: "1rem",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: "1.5rem",
            fontWeight: "300",
            lineHeight: "2rem",
            marginBottom: "3.5rem",
          }}
        >
          {subtitle}
        </p>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: "2rem" }}>
            <label
              htmlFor="shortname"
              style={{ display: "block", marginBottom: "1.25rem" }}
            >
              <p
                style={{
                  display: "block",
                  fontWeight: "700",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                }}
              >
                Personal Username
              </p>
              <p
                style={{
                  color: "#000000",
                  fontSize: "0.875rem",
                  marginBottom: "1.25rem",
                  opacity: 0.6,
                  lineHeight: "1.25rem",
                }}
              >
                Your own personal graph will exist under this username. e.g.
                https://hash.ai/
                <strong style={{ color: "#000000", opacity: "1" }}>
                  @{shortnameWatcher || "example"}
                </strong>
              </p>
            </label>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Controller
                  control={control}
                  name="shortname"
                  rules={{ validate: validateShortname }}
                  render={({ field }) => (
                    <Box
                      component="input"
                      id="shortname"
                      onChange={(evt) => {
                        const newEvt = { ...evt };
                        newEvt.target.value = parseShortnameInput(
                          newEvt.target.value,
                        );
                        field.onChange(newEvt);
                      }}
                      onBlur={field.onBlur}
                      autoFocus
                      sx={{
                        borderColor: shortnameError ? "#FCA5A5" : "#D1D5DB",
                        borderRadius: "0.5rem",
                        borderStyle: "solid",
                        borderWidth: 1,
                        height: "2.75rem",
                        marginRight: "1.75rem",
                        paddingBottom: "1.5rem",
                        paddingLeft: "2.25rem",
                        paddingRight: "1.25rem",
                        paddingTop: "1.5rem",
                        width: "16rem",

                        "&:focus": {
                          borderColor: shortnameError ? "#EF4444" : "#2563EB",
                          outline: "none",
                        },
                      }}
                      placeholder="example"
                      autoComplete="off"
                    />
                  )}
                />

                <span
                  style={{
                    position: "absolute",
                    left: "1.25rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9CA3AF",
                  }}
                >
                  @
                </span>
              </div>
              <div
                style={{
                  alignItems: "center",
                  borderColor: shortnameError ? "#FCA5A5" : "#D1D5DB",
                  borderRadius: "0.375rem",
                  borderWidth: 1,
                  display: "flex",
                  maxWidth: "24rem",
                  minHeight: 50,
                  paddingLeft: "0.875rem",
                  paddingRight: "0.875rem",
                  transitionProperty: "opacity",
                }}
              >
                <InfoIcon
                  style={{
                    color: shortnameError ? "#EF4444" : "#3B82F6",
                    height: "1.5rem",
                    marginRight: "0.75rem",
                    width: "1.5rem",
                  }}
                />
                <span
                  style={{
                    flex: "1 1 0%",
                    ...(shortnameError
                      ? {
                          color: "#EF4444",
                          fontSize: "0.875rem",
                          lineHeight: "1.25rem",
                        }
                      : {
                          color: "#000000",
                          textOpacity: "0.6",
                          fontSize: "0.75rem",
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
                </span>
              </div>
            </div>
          </div>
          <div>
            <label
              htmlFor="name"
              style={{
                display: "block",
                fontWeight: "700",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Preferred name{" "}
              <span style={{ fontWeight: "400" }}>or first name</span>
            </label>
            <p
              style={{
                color: "#000000",
                fontSize: "0.875rem",
                lineHeight: "1.25rem",
                marginBottom: "1.25rem",
                opacity: 0.6,
              }}
            >
              What shall we call you when referring to you? e.g. “Hi,{" "}
              <strong
                style={{
                  color: "#000000",
                  opacity: 1,
                  textTransform: "capitalize",
                }}
              >
                {preferredNameWatcher || "Bobby"}
              </strong>
              ”
            </p>
            <Box
              component="input"
              id="name"
              sx={{
                paddingLeft: "1.25rem",
                paddingRight: "1.25rem",
                paddingTop: "1.5rem",
                paddingBottom: "1.5rem",
                width: "16rem",
                height: "2.75rem",
                borderRadius: "0.5rem",
                borderColor: "#D1D5DB",
                borderStyle: "solid",

                "&:focus": {
                  borderColor: "#2563EB",
                  outline: "none",
                },
              }}
              placeholder="Bobby"
              {...register("preferredName", { required: true })}
            />
          </div>

          {!!invitationInfo && (
            <div style={{ marginTop: "2rem" }}>
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
                <p
                  style={{
                    marginTop: "1.25rem",
                    color: "#EF4444",
                    fontSize: "0.875rem",
                    lineHeight: "1.25rem",
                  }}
                >
                  {errorMessage}
                </p>
              ) : null}
            </div>
          )}

          <Box
            component="button"
            type="submit"
            sx={{
              alignItems: "center",
              backgroundColor: "#EC4899",
              backgroundImage:
                "background-image: linear-gradient(to right, var(--tw-gradient-stops))",
              borderRadius: "0.5rem",
              borderStyle: "none",
              color: "#ffffff",
              cursor: "pointer",
              display: "flex",
              fontSize: "0.875rem",
              fontWeight: "700",
              height: "2.75rem",
              justifyContent: "center",
              lineHeight: "1.25rem",
              marginTop: "3.5rem",
              transitionProperty: "all",
              width: "16rem",

              ":disabled": {
                opacity: 0.5,
              },
            }}
            disabled={
              !isValid ||
              loading ||
              (!!invitationInfo && !responsibilityWatcher)
            }
          >
            {loading ? (
              <SpinnerIcon
                style={{
                  animation: "spin 1s linear infinite",
                  color: "#ffffff",
                  width: "1rem",
                  height: "1rem",
                }}
              />
            ) : (
              <>
                <span>Continue</span>
                <Box
                  component="span"
                  sx={{
                    marginLeft: "0.5rem",
                    transitionProperty: "all",

                    "button:hover &": {
                      transform: "translateX(0.25rem)",
                    },
                  }}
                >
                  &rarr;
                </Box>
              </>
            )}
          </Box>
        </form>
      </div>
    </div>
  );
};
