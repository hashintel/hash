import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { ThemeProvider } from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import { render, RenderOptions } from "@testing-library/react";

import { theme } from "@hashintel/hash-design-system";
import { ReactNode } from "react";

type CustomRenderOptions = RenderOptions & {
  mocks?: Readonly<MockedResponse[]>;
};

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {},
) => {
  const { mocks = [] } = options;
  const Wrapper: React.FC<{ children: ReactNode }> = ({ children }) => (
    <ThemeProvider theme={theme}>
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    </ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};

export * from "@testing-library/react";
export { customRender as render };
