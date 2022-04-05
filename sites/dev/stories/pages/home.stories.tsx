import { PageLayout } from "../../src/components/PageLayout";
import Home from "../../src/pages/index.page";

export const HomePage = () => (
  <PageLayout>
    <Home />
  </PageLayout>
);

export default {
  title: "Pages/Home",
  component: HomePage,
  parameters: {
    layout: "fullscreen",
  },
};
