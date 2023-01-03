import {
  Box,
  Checkbox,
  Collapse,
  collapseClasses,
  Input,
  inputClasses,
  InputProps,
  Typography,
} from "@mui/material";
import {
  forwardRef,
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useController, useFormContext } from "react-hook-form";

import { PropertyTypeFormValues } from "../../../../property-type-form-values";

type ItemInputProps = { width: string } & InputProps;

const ItemInput = forwardRef(({ width, ...props }: ItemInputProps, ref) => (
  <Input
    type="number"
    {...props}
    ref={ref}
    sx={({ palette, transitions }) => ({
      width,
      fontSize: 11,
      height: 16,
      color: palette.white,
      transition: transitions.create("color"),

      "::before": {
        display: "none",
      },
      "::after": {
        borderBottomStyle: "dotted",
        borderBottomColor: palette.white,
        borderBottomWidth: 1,
      },

      ":hover": {
        "::after": {
          transform: "scaleX(1) translateX(0)",
        },
      },

      [`.${inputClasses.disabled}`]: {
        WebkitTextFillColor: "initial",
      },

      // <-- Hide number input default arrows -->
      "& input[type=number]": {
        WebkitAppearance: "textfield",
      },
      "& input[type=number]::-webkit-outer-spin-button": {
        WebkitAppearance: "none",
        margin: 0,
      },
      "& input[type=number]::-webkit-inner-spin-button": {
        WebkitAppearance: "none",
        margin: 0,
      },
      // <-- Hide number input default arrows -->
    })}
  />
));

interface ArrayMinMaxItemsProps {
  arrayId: string;
}

export const ArrayMinMaxItems: FunctionComponent<ArrayMinMaxItemsProps> = ({
  arrayId,
}) => {
  const { control, setValue } = useFormContext<PropertyTypeFormValues>();

  const minItemsController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${arrayId}.data.minItems`,
  });
  const maxItemsController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${arrayId}.data.maxItems`,
  });
  const infinityController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${arrayId}.data.infinity`,
  });

  const [minItemsWidth, setMinItemsWidth] = useState(0);
  const [maxItemsWidth, setMaxItemsWidth] = useState(0);
  const [maxItemsHovered, setMaxItemsHovered] = useState(false);

  const minItemsInputRef = useRef<HTMLInputElement | null>();
  const maxItemsInputRef = useRef<HTMLInputElement | null>();

  const setInputSize = useCallback(() => {
    setMinItemsWidth(minItemsInputRef.current?.value.length ?? 1);
    setMaxItemsWidth(maxItemsInputRef.current?.value.length ?? 1);
  }, []);

  useEffect(() => {
    setInputSize();
  }, [setInputSize]);

  return (
    <Box display="flex" gap={1.25}>
      <Box display="flex">
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            py: 0.25,
            px: 1,
            background: ({ palette }) => palette.gray[80],
            borderBottomLeftRadius: 30,
            borderTopLeftRadius: 30,
          }}
        >
          <Typography
            variant="smallCaps"
            sx={{
              fontSize: 11,
              color: ({ palette }) => palette.gray[30],
            }}
          >
            Min
          </Typography>
        </Box>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            py: 0.25,
            pr: 1,
            pl: 0.75,
            background: ({ palette }) => palette.gray[90],
            borderBottomRightRadius: 30,
            borderTopRightRadius: 30,
          }}
        >
          <ItemInput
            {...minItemsController.field}
            inputRef={minItemsInputRef}
            width={`${minItemsWidth || 1}ch`}
            onChange={(evt) => {
              const target = evt.target as HTMLInputElement;

              const min = Number.isNaN(target.valueAsNumber)
                ? 0
                : Math.max(0, target.valueAsNumber);

              if (min > maxItemsController.field.value) {
                setValue(
                  `flattenedCustomExpectedValueList.${arrayId}.data.maxItems`,
                  min,
                  { shouldDirty: true },
                );
              }
              minItemsController.field.onChange(min);

              setImmediate(() => {
                setInputSize();
              });
            }}
          />
        </Box>
      </Box>

      <Box
        display="flex"
        onMouseEnter={() => setMaxItemsHovered(true)}
        onMouseLeave={() => setMaxItemsHovered(false)}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            py: 0.25,
            px: 1,
            background: ({ palette }) => palette.gray[80],
            borderBottomLeftRadius: 30,
            borderTopLeftRadius: 30,
          }}
        >
          <Typography
            variant="smallCaps"
            sx={{
              fontSize: 11,
              color: ({ palette }) => palette.gray[30],
            }}
          >
            Max
          </Typography>
        </Box>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            py: 0.25,
            px: 1,
            pl: 0.75,
            background: ({ palette }) => palette.gray[90],
            borderBottomRightRadius: 30,
            borderTopRightRadius: 30,
            fontSize: 11,
          }}
        >
          <Collapse
            orientation="horizontal"
            in={maxItemsHovered}
            sx={{
              [`.${collapseClasses.wrapperInner}`]: {
                display: "flex",
                alignItems: "center",
              },
            }}
            collapsedSize={
              infinityController.field.value ? 0 : `${maxItemsWidth || 1}ch`
            }
          >
            <Box>
              <ItemInput
                {...maxItemsController.field}
                inputRef={maxItemsInputRef}
                disabled={infinityController.field.value}
                width={`${maxItemsWidth || 1}ch`}
                onChange={(evt) => {
                  const target = evt.target as HTMLInputElement;
                  const max = Number.isNaN(target.valueAsNumber)
                    ? 0
                    : Math.max(0, target.valueAsNumber);

                  if (max < minItemsController.field.value) {
                    setValue(
                      `flattenedCustomExpectedValueList.${arrayId}.data.minItems`,
                      max,
                      { shouldDirty: true },
                    );
                  }
                  maxItemsController.field.onChange(max);

                  setInputSize();
                }}
              />
            </Box>
            <Typography
              variant="smallTextLabels"
              sx={{
                pl: 0.5,
                fontSize: 11,
                color: ({ palette }) => palette.white,
                whiteSpace: "nowrap",
                pr: 0.5,
              }}
            >
              or allow
            </Typography>
          </Collapse>
          <Collapse
            orientation="horizontal"
            in={maxItemsHovered}
            sx={{
              [`.${collapseClasses.wrapperInner}`]: {
                display: "flex",
                alignItems: "center",
              },
            }}
            collapsedSize={infinityController.field.value ? 12 : 0}
          >
            <Typography
              variant="smallTextLabels"
              sx={{
                fontSize: 11,
                color: ({ palette }) => palette.white,
                whiteSpace: "nowrap",
              }}
            >
              ∞
              <Checkbox
                {...infinityController.field}
                checked={infinityController.field.value}
                sx={{
                  ml: 0.5,
                  width: 12,
                  height: 12,
                  "&, > svg": { fontSize: 12 },
                }}
                size="small"
              />
            </Typography>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
};
