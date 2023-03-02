import { useRouter } from "next/router";

const defaultTab = "definition";

export const useCurrentTab = () => useRouter().query.tab ?? defaultTab;

export const getTabValue = (tab: string) => (tab === defaultTab ? "" : tab);

export const getTabUrl = (baseUrl: string, tab: string) =>
  tab === defaultTab ? baseUrl : `${baseUrl}?tab=${encodeURIComponent(tab)}`;
