import React, { VFC } from "react";
import { RegisterOptions, useForm } from "react-hook-form";
import { tw } from "twind";
import { OrgSize } from "../../../../graphql/apiTypes.gen";
import { SelectInput } from "../../../forms/SelectInput";
import { TextInput } from "../../../forms/TextInput";
import { IconSpinner } from "../../../Icons/IconSpinner";

type OrgCreateProps = {
  createOrg: (info: Inputs) => void;
  loading: boolean;
};

const ROLES = [
  { label: "Marketing", value: "Marketing" },
  { label: "Sales", value: "Sales" },
  { label: "Operations", value: "Operations" },
  { label: "Customer Success", value: "Customer Success" },
  { label: "Design", value: "Design" },
  { label: "Engineering", value: "Engineering" },
  { label: "Product", value: "Product" },
  { label: "IT", value: "IT" },
  { label: "HR", value: "HR" },
  { label: "Cross-Functional", value: "Cross-Functional" },
];

const ORG_SIZES = [
  { label: "1-10 people", value: OrgSize.OneToTen },
  { label: "11-50 people", value: OrgSize.ElevenToFifty },
  { label: "51-250 people", value: OrgSize.FiftyOneToTwoHundredAndFifty },
  { label: "250+ people", value: OrgSize.TwoHundredAndFiftyPlus },
];

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
  },
  {
    name: "responsibility",
    label: "Your Role",
    inputType: "selectInput",
    options: ROLES,
    fieldOptions: {
      required: true,
    },
  },
];

type FormInputsType = {
  name: keyof Inputs;
  label: string;
  inputType: "textInput" | "selectInput";
  options?: { label: string; value: string }[];
  fieldOptions: RegisterOptions;
}[];

type Inputs = {
  name: string;
  shortname: string;
  orgSize: OrgSize;
  responsibility: string;
};

export const OrgCreate: VFC<OrgCreateProps> = ({ createOrg, loading }) => {
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    mode: "onChange",
  });
  const onSubmit = handleSubmit(createOrg);
  const nameWatcher = watch("name");

  const getInitials = () => {
    if (!nameWatcher) return;
    const initials = nameWatcher.trim().split(" ");
    if (!initials.length) return "";
    if (initials.length == 1) return initials[0][0];
    if (initials.length > 1) return initials[0][0] + initials[1][0];
  };

  return (
    <div className={tw`flex flex-col items-center`}>
      ˝<h1 className={tw`text-3xl mb-12`}>Create a team workspace</h1>
      <div className={tw`text-center mb-6`}>
        <div
          className={tw`w-24 h-24 border-1 border-gray-200 rounded-lg flex justify-center items-center mb-2`}
        >
          <p className={tw`text-4xl font-bold text-gray-200 uppercase`}>
            {getInitials()}
          </p>
        </div>
        <span className={tw`text-sm font-bold text-gray-500`}>Add a logo</span>
      </div>
      <div>
        {FORM_INPUTS.map((field) => {
          return (
            <React.Fragment key={field.name}>
              {field.inputType == "selectInput" ? (
                <SelectInput
                  label={field.label}
                  options={field.options as { label: string; value: string }[]}
                  {...register(field.name, field.fieldOptions)}
                />
              ) : (
                <TextInput
                  label={field.label}
                  transparent
                  {...register(field.name, field.fieldOptions)}
                />
              )}
              <span className={tw`text-red-500 text-sm`}>
                {errors?.[field.name]?.message}
              </span>
              <div className={tw`mb-6`}></div>
            </React.Fragment>
          );
        })}
        <button
          className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto`}
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <IconSpinner className={tw`h-4 w-4 text-white animate-spin`} />
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
