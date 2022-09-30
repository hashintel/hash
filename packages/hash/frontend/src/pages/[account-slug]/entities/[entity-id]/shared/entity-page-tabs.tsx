import { Container, Tab, Tabs } from "@mui/material";
import { useRouter } from "next/router";

export const entityTabs: { title: string; value: string }[] = [
  {
    title: "Overview",
    value: "overview",
  },
  {
    title: "Context",
    value: "context",
  },
  {
    title: "History",
    value: "history",
  },
];

export const EntityPageTabs = () => {
  const router = useRouter();

  const currentTabValue =
    entityTabs.find((tab) => router.asPath.includes(`/${tab.value}`))?.value ||
    "overview";

  return (
    <Container>
      <Tabs value={currentTabValue}>
        {entityTabs.map(({ title, value }) => {
          const tabHref = `${router.asPath.split(currentTabValue)[0]}${value}`;

          return (
            <Tab
              key={value}
              label={title}
              value={value}
              href={tabHref}
              component="a"
              onClick={(event) => {
                event.preventDefault();
                void router.push(tabHref);
              }}
            />
          );
        })}
      </Tabs>
    </Container>
  );
};
