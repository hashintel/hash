import React, { VFC } from "react";
import { RegisterOptions, useForm, Controller } from "react-hook-form";
import { tw } from "twind";
import { OrgSize } from "../../../../graphql/apiTypes.gen";
import { SelectInput } from "../../../forms/SelectInput";
import { TextInput } from "../../../forms/TextInput";
import { PictureIcon } from "../../../Icons/PictureIcon";
import { SpinnerIcon } from "../../../Icons/SpinnerIcon";
import { ORG_ROLES, ORG_SIZES } from "../utils";

type OrgCreateProps = {
  createOrg: (info: Inputs) => void;
  loading: boolean;
};

const FORM_INPUTS: FormInputsType = [
  {
    name: "name",
    label: "Workspace Name",
    inputType: "textInput",
    fieldOptions: {
      required: true,
    },
  },
  {
    name: "shortname",
    label: "Org Username",
    inputType: "textInput",
    fieldOptions: {
      required: true,
      minLength: {
        value: 4,
        message: "Must be at least 4 characters",
      },
      maxLength: {
        value: 24,
        message: "Must be shorter than 24 characters",
      },
      pattern: {
        value: /[a-zA-Z0-9-_]+/,
        message: "Must only take alphanumeric characters",
      },
    },
  },
  {
    name: "orgSize",
    label: "Org Size",
    inputType: "selectInput",
    options: ORG_SIZES,
    fieldOptions: {
      required: true,
    },
    placeholder: "Number of People",
  },
  {
    name: "responsibility",
    label: "Your Role",
    inputType: "selectInput",
    options: ORG_ROLES,
    fieldOptions: {
      required: true,
    },
    placeholder: "Current Position",
  },
];

type FormInputsType = {
  name: keyof Inputs;
  label: string;
  inputType: "textInput" | "selectInput";
  options?: { label: string; value: string }[];
  fieldOptions: RegisterOptions;
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

export const OrgCreate: VFC<OrgCreateProps> = ({ createOrg, loading }) => {
  const {
    register,
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
  const onSubmit = handleSubmit(createOrg);
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
      <div>
        {FORM_INPUTS.map(
          ({ name, label, inputType, options, placeholder, fieldOptions }) => {
            return (
              <React.Fragment key={name}>
                {inputType === "selectInput" ? (
                  <Controller
                    control={control}
                    name={name}
                    rules={{ required: true }}
                    render={({ field: { onChange, value } }) => (
                      <SelectInput
                        className={tw`w-64`}
                        label={label}
                        options={options as { label: string; value: string }[]}
                        onChange={onChange}
                        value={value}
                        {...(placeholder && { placeholder })}
                      />
                    )}
                  />
                ) : (
                  <TextInput
                    className={tw`w-64 mb-2`}
                    label={label}
                    transparent
                    {...register(name, fieldOptions)}
                  />
                )}
                <span className={tw`text-red-500 text-sm`}>
                  {errors?.[name]?.message}
                </span>
                <div className={tw`mb-6`} />
              </React.Fragment>
            );
          },
        )}
        <button
          className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto`}
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
      </div>
    </div>
  );
};
