import React, { VFC } from "react";
import { useForm } from "react-hook-form";
import { tw } from "twind";
import { OrgSize } from "../../../../graphql/apiTypes.gen";
import { SelectInput } from "../../../forms/SelectInput";
import { TextInput } from "../../../forms/TextInput";
import { IconSpinner } from "../../../Icons/IconSpinner";

type OrgCreateProps = {};

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

const FORM_INPUTS = [
  {
    name: "name",
    label: "Workspace Name",
    inputType: "textInput",
  },
  {
    name: "shortname",
    label: "Org Username",
    inputType: "textInput",
  },
  {
    name: "orgSize",
    label: "Org Size",
    inputType: "selectInput",
    options: ORG_SIZES,
  },
  {
    name: "responsibility",
    label: "Your Role",
    inputType: "selectInput",
    options: ROLES,
  },
] as const;

type Inputs = {
  name: string;
  shortname: string;
  orgSize: string;
  responsibility: string;
};

export const OrgCreate: VFC<OrgCreateProps> = () => {
  const { register, handleSubmit } = useForm<Inputs>();

  const onSubmit = handleSubmit((data) => {
    console.log("data ==> ", data);
  });

  return (
    <div className={tw`flex flex-col items-center`}>
      <h1 className={tw`text-3xl mb-12`}>Create a team workspace</h1>

      <div className={tw`text-center mb-6`}>
        <div
          className={tw`w-24 h-24 border-1 border-gray-200 rounded-lg flex justify-center items-center mb-2`}
        >
          <p className={tw`text-4xl font-bold text-gray-200 uppercase`}>AC</p>
        </div>
        <span className={tw`text-sm font-bold text-gray-500`}>Add a logo</span>
      </div>
      <div>
        {FORM_INPUTS.map((field) => {
          return (
            <React.Fragment>
              {field.inputType == "selectInput" ? (
                <SelectInput
                  className={tw`mb-6`}
                  label={field.label}
                  options={field.options}
                  key={field.name}
                  {...register(field.name)}
                />
              ) : (
                <TextInput
                  className={tw`mb-6`}
                  label={field.label}
                  transparent
                  key={field.name}
                  {...register(field.name)}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* <TextInput
          className={tw`mb-6`}
          label="Workspace Name"
          transparent
          {...register("name")}
        />
        <TextInput
          className={tw`mb-6`}
          label="Org Username"
          transparent
          {...register("shortname")}
        />
        <TextInput
          className={tw`mb-6`}
          label="Org Size"
          transparent
          {...register("orgSize")}
        /> */}
        {/* 
        <SelectInput
          className={tw`mb-6`}
          label="Your Role"
          options={ROLES}
          onChange={(x) => {}}
        /> */}
        {/* @todo use Button component */}
        <button
          className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto`}
          onClick={onSubmit}
          disabled={false}
        >
          {false ? (
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
