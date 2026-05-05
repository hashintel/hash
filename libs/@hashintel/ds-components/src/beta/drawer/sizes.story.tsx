import { Portal } from "@ark-ui/react/portal";
import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button/button";
import { CloseButton } from "../close-button/close-button";
import * as Drawer from "./drawer";

export const App = () => {
  return (
    <Wrap gap="4">
      {(["xs", "sm", "md", "lg", "xl", "full"] as const).map((size) => (
        <Drawer.Root key={size} size={size}>
          <Drawer.Trigger asChild>
            <Button variant="outline">Open ({size})</Button>
          </Drawer.Trigger>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content>
                <Drawer.CloseTrigger asChild>
                  <CloseButton />
                </Drawer.CloseTrigger>
                <Drawer.Header>
                  <Drawer.Title>Title</Drawer.Title>
                  <Drawer.Description>Description</Drawer.Description>
                </Drawer.Header>
                <Drawer.Body>{/* Content */}</Drawer.Body>
                <Drawer.Footer>
                  <Button>Save</Button>
                </Drawer.Footer>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      ))}
    </Wrap>
  );
};
