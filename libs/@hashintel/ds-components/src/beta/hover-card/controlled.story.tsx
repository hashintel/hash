"use client";

import { Portal } from "@ark-ui/react/portal";
import { HStack, Stack } from "@hashintel/ds-helpers/jsx";
import { MapPinIcon } from "lucide-react";
import { useState } from "react";

import * as Avatar from "../avatar/avatar";
import { Icon } from "../icon/icon";
import { Link } from "../link/link";
import { Text } from "../text/text";
import * as HoverCard from "./hover-card";

export const App = () => {
  const [open, setOpen] = useState(false);

  return (
    <HoverCard.Root open={open} onOpenChange={(e) => setOpen(e.open)}>
      <HoverCard.Trigger asChild>
        <Link href="https://twitter.com/grizzly_codes/" target="_blank">
          @grizzly_codes
        </Link>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content>
            <HoverCard.Arrow>
              <HoverCard.ArrowTip />
            </HoverCard.Arrow>
            <Stack gap="4" direction="row">
              <Avatar.Root size="lg">
                <Avatar.Image src="https://avatars.githubusercontent.com/u/1846056?v=4" />
                <Avatar.Fallback name="Christian Busch" />
              </Avatar.Root>
              <Stack gap="3">
                <Stack gap="1">
                  <Text fontWeight="semibold">@grizzly_codes</Text>
                  <Text color="fg.muted">
                    Principal Software Engineer working at Pyck.ai
                  </Text>
                </Stack>
                <HStack gap="1" color="fg.subtle">
                  <Icon size="sm">
                    <MapPinIcon />
                  </Icon>
                  <Text textStyle="xs">Joined Oktober 2025</Text>
                </HStack>
              </Stack>
            </Stack>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
};
