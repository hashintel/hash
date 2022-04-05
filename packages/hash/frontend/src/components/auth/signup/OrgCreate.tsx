import React, { ChangeEvent, useMemo, VFC, useState } from "react";
import { useForm, Controller, RegisterOptions } from "react-hook-form";
import { tw } from "twind";
import { useMutation } from "@apollo/client";
import {
  OrgSize,
  CreateOrgMutation,
  CreateOrgMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { SelectInput } from "../../forms/SelectInput";
import { TextInput } from "../../forms/TextInput";
import { PictureIcon, SpinnerIcon } from "../../../shared/icons";
import { ORG_ROLES, ORG_SIZES } from "../utils";
import { createOrg as createOrgMutation } from "../../../graphql/queries/org.queries";
import { useShortnameInput } from "../../hooks/useShortnameInput";
// import { useFileUpload } from "../../../hooks/useFileUpload";

type OrgCreateProps = {
  // accountId: string;
  onCreateOrgSuccess: (data: {
    invitationLinkToken: string;
    orgEntityId: string;
  }) => void;
};

const FORM_INPUTS: FormInputsType = [
  {
    name: "name",
    label: "Workspace Name",
    inputType: "textInput",
    placeholder: "Acme",
    fieldOptions: {
      required: {
        value: true,
        message: "You must choose a workspace name",
      },
    },
  },
  {
    name: "shortname",
    label: "Org Username",
    inputType: "textInput",
    placeholder: "acme-corp",
    fieldOptions: {
      required: false, // we don't need to pass required rule for shortname since validateShortname checks for that
    },
  },
  {
    name: "orgSize",
    label: "Org Size",
    inputType: "selectInput",
    options: ORG_SIZES,
    placeholder: "Number of People",
    fieldOptions: {
      required: {
        value: true,
        message: "You must choose the org size",
      },
    },
  },
  {
    name: "responsibility",
    label: "Your Role",
    inputType: "selectInput",
    options: ORG_ROLES,
    placeholder: "Current Position",
    fieldOptions: {
      required: {
        value: true,
        message: "You must choose your role",
      },
    },
  },
];

type FormInputsType = {
  name: keyof Inputs;
  label: string;
  inputType: "textInput" | "selectInput";
  options?: { label: string; value: string }[];
  placeholder?: string;
  fieldOptions: RegisterOptions;
}[];

type Inputs = {
  name: string;
  shortname: string;
  orgSize: OrgSize;
  responsibility: string;
};

const getInitials = (name: string) => {
  const initials = name.trim().split(" ");
  if (!initials.length) return "";
  if (initials.length === 1) return initials[0]![0];
  if (initials.length > 1) return initials[0]![0]! + initials[1]![0]!;
};

export const OrgCreate: VFC<OrgCreateProps> = ({
  // accountId,
  onCreateOrgSuccess,
}) => {
  const [avatarImg, setAvatarImg] = useState("");
  const {
    watch,
    handleSubmit,
    formState: { errors, isValid, touchedFields },
    control,
  } = useForm<Inputs>({
    mode: "all",
    defaultValues: {
      responsibility: undefined,
      orgSize: undefined,
    },
  });

  const { parseShortnameInput, validateShortname, getShortnameError } =
    useShortnameInput();

  const [createOrg, { loading, error }] = useMutation<
    CreateOrgMutation,
    CreateOrgMutationVariables
  >(createOrgMutation, {
    errorPolicy: "ignore",
    onCompleted: (res) => {
      const accessToken =
        res.createOrg.invitationLinks[0]!.properties.accessToken;
      if (accessToken) {
        onCreateOrgSuccess({
          orgEntityId: res.createOrg.accountId,
          invitationLinkToken: accessToken,
        });
      }
    },
  });

  const createOrgErrorMessage = useMemo(() => {
    return error?.graphQLErrors?.[0]?.message ?? "";
  }, [error]);

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();

      reader.onload = (evt) => {
        if (evt.target?.result) {
          setAvatarImg(evt.target.result.toString());
        }
      };

      reader.readAsDataURL(file);

      // @todo this should be delayed till org creation
      // await uploadFile({
      //   file: file,
      //   mediaType: "image",
      // });
    }
  };

  const onSubmit = handleSubmit((values) =>
    createOrg({
      variables: {
        org: {
          shortname: values.shortname,
          name: values.name,
          orgSize: values.orgSize,
        },
        responsibility: values.responsibility,
      },
    }),
  );

  const nameWatcher = watch("name", "");

  const shortnameError = getShortnameError(
    errors?.shortname?.message,
    Boolean(touchedFields.shortname),
  );

  return (
    <div className={tw`flex flex-col items-center`}>
      <h1 className={tw`text-3xl font-bold mb-12`}>Create a team workspace</h1>
      <div className={tw`text-center mb-6`}>
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label className={tw`cursor-pointer`}>
          {avatarImg ? (
            <img
              className={tw`w-24 h-24 mb-2 rounded-md`}
              src={avatarImg}
              alt="Organization avatar"
            />
          ) : nameWatcher ? (
            <div
              className={tw`relative w-24 h-24 border-1 border-gray-200 rounded-lg flex justify-center items-center mb-2`}
            >
              <p className={tw`text-4xl font-bold text-gray-200 uppercase`}>
                {getInitials(nameWatcher)}
              </p>
            </div>
          ) : (
            <PictureIcon className={tw`w-24 h-24 mb-2 `} />
          )}
          <input
            type="file"
            onChange={handleAvatarUpload}
            accept="image/*"
            className={tw`hidden`}
          />
          <span className={tw`text-sm font-bold text-gray-500`}>
            Add a logo
          </span>
        </label>
      </div>
      <form className={tw`flex flex-col items-center`} onSubmit={onSubmit}>
        {FORM_INPUTS.map(
          (
            { name, label, inputType, options, placeholder, fieldOptions },
            index,
          ) => {
            return (
              <React.Fragment key={name}>
                <Controller
                  control={control}
                  name={name}
                  rules={{
                    ...fieldOptions,
                    ...(name === "shortname" && {
                      validate: validateShortname,
                    }),
                  }}
                  render={({ field: { onChange, onBlur, value } }) =>
                    inputType === "selectInput" ? (
                      <SelectInput
                        className={tw`w-64`}
                        label={label}
                        options={options as { label: string; value: string }[]}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                        {...(placeholder && { placeholder })}
                      />
                    ) : (
                      <TextInput
                        className={tw`w-64 mb-2`}
                        label={label}
                        transparent
                        onChange={(evt) => {
                          const newEvt = { ...evt };
                          if (name === "shortname") {
                            newEvt.target.value = parseShortnameInput(
                              newEvt.target.value,
                            );
                          }
                          onChange(newEvt);
                        }}
                        onBlur={onBlur}
                        autoComplete="off"
                        {...(placeholder && { placeholder })}
                      />
                    )
                  }
                />

                <span className={tw`text-red-500 text-sm`}>
                  {name === "shortname"
                    ? shortnameError
                    : errors?.[name]?.message}
                </span>
                {index !== FORM_INPUTS.length - 1 && (
                  <div className={tw`mb-6`} />
                )}
              </React.Fragment>
            );
          },
        )}
        {createOrgErrorMessage && (
          <p className={tw`text-red-500 mt-3`}>{createOrgErrorMessage}</p>
        )}
        <button
          className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto mt-6`}
          onClick={onSubmit}
          disabled={loading || !isValid}
          type="submit"
        >
          {loading ? (
            <SpinnerIcon className={tw`h-4 w-4 text-white animate-spin`} />
          ) : (
            <>
              <span>Continue</span>
              <span
                className={tw`ml-2 transition-all group-hover:translate-x-1`}
              >
                &rarr;
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
