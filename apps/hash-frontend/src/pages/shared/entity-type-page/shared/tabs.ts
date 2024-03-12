import { useRouter } from "next/router";

const defaultTab = "definition";

export const useCurrentTab = () => useRouter().query.tab ?? defaultTab;

export const getTabValue = (tab: string) => (tab === defaultTab ? "" : tab);

export const getTabUrl = (tab: string) => {
  const pathWithoutParams = window.location.pathname.split("?")[0]!;
  return tab === defaultTab
    ? pathWithoutParams
    : `${pathWithoutParams}?tab=${encodeURIComponent(tab)}`;
};
