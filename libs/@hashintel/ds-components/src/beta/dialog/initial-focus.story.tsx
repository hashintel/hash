"use client";

import { Portal } from "@ark-ui/react/portal";
import { useRef } from "react";

import { Button } from "../button/button";
import { CloseButton } from "../close-button/close-button";
import * as Field from "../field/field";
import { Input } from "../input/input";
import * as Dialog from "./dialog";

export const App = () => {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <Dialog.Root initialFocusEl={() => ref.current}>
      <Dialog.Trigger asChild>
        <Button variant="outline">Open Dialog</Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Title</Dialog.Title>
              <Dialog.Description>Description</Dialog.Description>
            </Dialog.Header>
            <Dialog.Body gap="4">
              <Field.Root>
                <Field.Label>First Name</Field.Label>
                <Input placeholder="First Name" />
              </Field.Root>
              <Field.Root>
                <Field.Label>Last Name</Field.Label>
                <Input ref={ref} placeholder="Last Name" />
              </Field.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">Cancel</Button>
              </Dialog.ActionTrigger>
              <Dialog.ActionTrigger asChild>
                <Button>Save</Button>
              </Dialog.ActionTrigger>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
