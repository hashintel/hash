import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { ThemeProvider } from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import { render, RenderOptions } from "@testing-library/react";

import { theme } from "../theme";

type CustomRenderOptions = RenderOptions & {
  mocks?: Readonly<MockedResponse[]>;
};

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {},
) => {
  const { mocks = [] } = options;
  const Wrapper: React.FC = ({ children }) => (
    <ThemeProvider theme={theme}>
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    </ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};

// eslint-disable-next-line no-restricted-imports
export * from "@testing-library/react";
export { customRender as render };
