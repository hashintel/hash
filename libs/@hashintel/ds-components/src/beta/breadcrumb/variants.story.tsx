import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Breadcrumb from "./breadcrumb";

export const App = () => {
  const variants = ["plain", "underline"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <Breadcrumb.Root key={variant} variant={variant}>
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
