import { useRouter } from "next/router";

const defaultTab = "definition";

export const useCurrentTab = () => useRouter().query.tab ?? defaultTab;

export const getTabValue = (tab: string) => (tab === defaultTab ? "" : tab);

export const getTabUri = (baseUri: string, tab: string) =>
  tab === defaultTab ? baseUri : `${baseUri}?tab=${encodeURIComponent(tab)}`;
