import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { SvgIcon, SvgIconProps } from "@mui/material";
import clsx from "clsx";
import { forwardRef } from "react";

type FontAwesomeIconProps = {
  icon: Pick<IconDefinition, "icon">;
} & SvgIconProps;

export const fontAwesomeIconClasses = {
  icon: "FontAwesomeIcon",
};

// gotten from https://mui.com/components/icons/#font-awesome
export const FontAwesomeIcon = forwardRef<
  SVGSVGElement,
  FontAwesomeIconProps // https://github.com/prettier/prettier/issues/11923
>((props, ref) => {
  const { icon, sx = [], ...otherProps } = props;

  const {
    icon: [width, height, , , svgPathData],
  } = icon;

  return (
    <SvgIcon
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      sx={[
        {
          color: "currentColor",
          width: "1em",
          height: "1em",
          fontSize: "16px",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...otherProps}
      classes={{
        ...(otherProps.classes ?? {}),
        root: clsx(fontAwesomeIconClasses.icon, otherProps.classes?.root),
      }}
    >
      {typeof svgPathData === "string" ? (
        <path d={svgPathData} />
      ) : (
        /**
         * A multi-path Font Awesome icon seems to imply a duotune icon. The 0th path seems to
         * be the faded element (referred to as the "secondary" path in the Font Awesome docs)
         * of a duotone icon. 40% is the default opacity.
         *
         * @see https://fontawesome.com/how-to-use/on-the-web/styling/duotone-icons#changing-opacity
         */
        svgPathData.map((pathData: string, i: number) => (
          <path
            key={pathData}
            style={{ opacity: i === 0 ? 0.4 : 1 }}
            d={pathData}
          />
        ))
      )}
    </SvgIcon>
  );
});
