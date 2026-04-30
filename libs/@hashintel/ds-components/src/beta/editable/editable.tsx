"use client";

import { Editable } from "@ark-ui/react/editable";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { editable } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

const { withProvider, withContext } = createStyleContext(editable);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Editable.Root, "root");
export const RootProvider = withProvider(Editable.RootProvider, "root");
export const Area = withContext(Editable.Area, "area");
export const CancelTrigger = withContext(
  Editable.CancelTrigger,
  "cancelTrigger",
);
export const Control = withContext(Editable.Control, "control");
export const EditTrigger = withContext(Editable.EditTrigger, "editTrigger");
export const Input = withContext(Editable.Input, "input");
export const Label = withContext(Editable.Label, "label");
export const Preview = withContext(Editable.Preview, "preview");
export const SubmitTrigger = withContext(
  Editable.SubmitTrigger,
  "submitTrigger",
);

export { EditableContext as Context } from "@ark-ui/react/editable";
