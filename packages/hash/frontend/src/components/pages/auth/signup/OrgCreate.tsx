import React, { useMemo, VFC } from "react";
import { useForm, Controller } from "react-hook-form";
import { tw } from "twind";
import { useMutation } from "@apollo/client";
import {
  OrgSize,
  CreateOrgMutation,
  CreateOrgMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { SelectInput } from "../../../forms/SelectInput";
import { TextInput } from "../../../forms/TextInput";
import { PictureIcon } from "../../../Icons/PictureIcon";
import { SpinnerIcon } from "../../../Icons/SpinnerIcon";
import { ORG_ROLES, ORG_SIZES } from "../utils";
import { createOrg as createOrgMutation } from "../../../../graphql/queries/org.queries";
import { useShortnameInput } from "../../../hooks/useShortnameInput";

type OrgCreateProps = {
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
  },
  {
    name: "shortname",
    label: "Org Username",
    inputType: "textInput",
    placeholder: "acme-corp",
  },
  {
    name: "orgSize",
    label: "Org Size",
    inputType: "selectInput",
    options: ORG_SIZES,
    placeholder: "Number of People",
  },
  {
    name: "responsibility",
    label: "Your Role",
    inputType: "selectInput",
    options: ORG_ROLES,
    placeholder: "Current Position",
  },
];

type FormInputsType = {
  name: keyof Inputs;
  label: string;
  inputType: "textInput" | "selectInput";
  options?: { label: string; value: string }[];
  placeholder?: string;
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
  if (initials.length === 1) return initials[0][0];
  if (initials.length > 1) return initials[0][0] + initials[1][0];
};

export const OrgCreate: VFC<OrgCreateProps> = ({ onCreateOrgSuccess }) => {
  const {
    watch,
    handleSubmit,
    formState: { errors, isValid },
    control,
  } = useForm<Inputs>({
    mode: "onChange",
    defaultValues: {
      responsibility: undefined,
      orgSize: undefined,
    },
  });

  const { parseShortnameInput, validateShortname } = useShortnameInput();

  const [createOrg, { loading, error }] = useMutation<
    CreateOrgMutation,
    CreateOrgMutationVariables
  >(createOrgMutation, {
    onCompleted: (res) => {
      const accessToken =
        res.createOrg.properties.invitationLink?.data.properties.accessToken;
      if (accessToken && res.createOrg.accountId) {
        onCreateOrgSuccess({
          orgEntityId: res.createOrg.accountId,
          invitationLinkToken: accessToken,
        });
      }
    },
    onError: () => {},
  });

  const createOrgErrorMessage = useMemo(() => {
    return error?.graphQLErrors?.[0]?.message ?? "";
  }, [error]);

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

  return (
    <div className={tw`flex flex-col items-center`}>
      <h1 className={tw`text-3xl font-bold mb-12`}>Create a team workspace</h1>
      <div className={tw`text-center mb-6`}>
        {nameWatcher ? (
          <div
            className={tw`relative w-24 h-24 border-1 border-gray-200 rounded-lg flex justify-center items-center mb-2`}
          >
            <p className={tw`text-4xl font-bold text-gray-200 uppercase`}>
              {getInitials(nameWatcher)}
            </p>
          </div>
        ) : (
          <PictureIcon className={tw`w-24 h-24 mb-2`} viewBox="0 0 45 45" />
        )}
        <span className={tw`text-sm font-bold text-gray-500`}>Add a logo</span>
      </div>
      <form className={tw`flex flex-col items-center`} onSubmit={onSubmit}>
        {FORM_INPUTS.map(
          ({ name, label, inputType, options, placeholder }, index) => {
            return (
              <React.Fragment key={name}>
                <Controller
                  control={control}
                  name={name}
                  rules={{
                    required: true,
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
                        {...(placeholder && { placeholder })}
                      />
                    )
                  }
                />

                <span className={tw`text-red-500 text-sm`}>
                  {errors?.[name]?.message}
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
