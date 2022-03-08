import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { createTheme, ThemeProvider } from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import { render, RenderOptions } from "@testing-library/react";

import { borderRadii } from "../theme/borderRadii";
import { palette } from "../theme/palette";
import { boxShadows, dropShadows } from "../theme/shadows";

type CustomRenderOptions = RenderOptions & {
  mocks?: MockedResponse[];
};

const theme = createTheme({ palette, boxShadows, dropShadows, borderRadii });

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
