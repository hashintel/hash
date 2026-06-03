import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes, type FormInputSize } from "../../util/form-shared";
import { InputConnectOr } from "./input-connector";
import { TextInput } from "./text-input";

import type { Story, StoryDefault } from "@ladle/react";

type ConnectorProps = React.ComponentProps<typeof InputConnectOr>;
type SideProps = ConnectorProps["left"];

const noop = () => {};

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[0]",
});

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#666",
};

const ConnectedPair = ({
  left,
  right,
  size,
}: {
  left: SideProps;
  right: SideProps;
  size: FormInputSize;
}) => (
  <div className={rowStyle}>
    <TextInput
      value="Left"
      onChange={noop}
      size={size}
      invalid={left.invalid}
      disabled={left.disabled}
      readonly={left.readonly}
      variant={left.variant}
    />
    <InputConnectOr size={size} left={left} right={right} />
    <TextInput
      value="Right"
      onChange={noop}
      size={size}
      invalid={right.invalid}
      disabled={right.disabled}
      readonly={right.readonly}
      variant={right.variant}
    />
  </div>
);

const sideStates: { key: string; label: string; props: SideProps }[] = [
  { key: "default", label: "Default", props: {} },
  { key: "invalid", label: "Invalid", props: { invalid: true } },
  { key: "disabled", label: "Disabled", props: { disabled: true } },
  {
    key: "invalid-disabled",
    label: "Invalid + Disabled",
    props: { invalid: true, disabled: true },
  },
];

export default {
  title: "Components/InputConnector",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={sectionStyle}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `auto repeat(${sideStates.length}, auto)`,
        columnGap: 24,
        rowGap: 12,
        alignItems: "center",
        justifyContent: "start",
      }}
    >
      <span />
      {sideStates.map((col) => (
        <span key={`col-${col.key}`} style={subheadingStyle}>
          Right: {col.label}
        </span>
      ))}
      {sideStates.flatMap((row) => [
        <span key={`row-${row.key}`} style={subheadingStyle}>
          Left: {row.label}
        </span>,
        ...sideStates.map((col) => (
          <ConnectedPair
            key={`${row.key}-${col.key}`}
            size="md"
            left={row.props}
            right={col.props}
          />
        )),
      ])}
    </div>
  </div>
);

export const Size: Story = () => (
  <div className={sectionStyle}>
    {formInputSizes.map((size) => (
      <div key={size} className={groupStyle}>
        <h3 style={headingStyle}>{size}</h3>
        <ConnectedPair size={size} left={{}} right={{}} />
      </div>
    ))}
  </div>
);
