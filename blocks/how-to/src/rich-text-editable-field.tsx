import { Box, SxProps, TextFieldProps, Theme } from "@mui/material";
import { useEffect, useRef } from "react";
import { useHook, useHookBlockModule } from "@blockprotocol/hook/react";

export const RichTextEditableField = ({
  entityId,
  fieldKey,
  readonly,
  value,
  placeholder,
  sx,
  placeholderSx = {},
}: {
  readonly?: boolean;
  placeholderSx?: SxProps<Theme>;
  fieldKey: string;
  entityId: string;
} & TextFieldProps) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const { hookModule } = useHookBlockModule(ref);

  useHook(hookModule, ref, "text", entityId, [fieldKey], (node) => {
    // eslint-disable-next-line no-param-reassign
    node.innerText = typeof value === "string" ? value : "";
    return () => {
      // eslint-disable-next-line no-param-reassign
      node.innerText = "";
    };
  });

  useEffect(() => {
    const editor = document.querySelector(`[data-slate-editor="true"]`);
    if (editor) {
      editor.setAttribute("contentEditable", (!readonly).toString());
    }

    const placeholderComponent = document.querySelector(
      `[data-slate-placeholder="true"]`,
    );
    if (placeholderComponent && placeholder) {
      placeholderComponent.textContent = placeholder;
    }
  }, [ref.current, value, readonly]);

  return (
    <Box
      sx={
        {
          width: 1,
          "& div": {
            padding: "0 !important",

            [`[data-slate-editor="true"]`]: sx,
            [`[data-slate-placeholder="true"]`]: {
              ...sx,
              ...placeholderSx,
            },
          },
        } as SxProps
      }
      ref={ref}
    />
  );
};
