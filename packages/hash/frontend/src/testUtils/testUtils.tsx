import { MockedProvider, MockedResponse } from "@apollo/client/testing";
// eslint-disable-next-line no-restricted-imports
import { render, RenderOptions } from "@testing-library/react";

type CustomRenderOptions = RenderOptions & {
  mocks?: MockedResponse[];
};

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { mocks = [] } = options;
  const Wrapper: React.FC = ({ children }) => (
    <MockedProvider mocks={mocks} addTypename={false}>
      {children}
    </MockedProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};

// eslint-disable-next-line no-restricted-imports
export * from "@testing-library/react";
export { customRender as render };
