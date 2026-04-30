import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Breadcrumb from "./breadcrumb";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <Breadcrumb.Root key={size} size={size}>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Link href="#">Docs</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Link href="#">Components</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>Breadcrumbs</Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      ))}
    </Stack>
  );
};
