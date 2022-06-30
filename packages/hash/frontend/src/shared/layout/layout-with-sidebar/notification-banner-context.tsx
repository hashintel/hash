import { useRouter } from "next/router";
import {
  createContext,
  FC,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type NotificationBannerContextState = {
  notificationBannerOpen: boolean;
  openNotificationBanner: () => void;
  closeNotificationBanner: () => void;
};

const NotificationBannerContext = createContext<NotificationBannerContextState>(
  {
    notificationBannerOpen: false,
    openNotificationBanner: () => {},
    closeNotificationBanner: () => {},
  },
);

export const useNotificationBannerContext = () =>
  useContext(NotificationBannerContext);

export const NotificationBannerContextProvider: FC = ({ children }) => {
  const [notificationBannerOpen, setNotificationBannerOpen] =
    useState<boolean>(false);

  const router = useRouter();

  useEffect(() => setNotificationBannerOpen(false), [router.asPath]);

  const value = useMemo(
    () => ({
      notificationBannerOpen,
      openNotificationBanner: () => setNotificationBannerOpen(true),
      closeNotificationBanner: () => setNotificationBannerOpen(false),
    }),
    [notificationBannerOpen, setNotificationBannerOpen],
  );

  return (
    <NotificationBannerContext.Provider value={value}>
      {children}
    </NotificationBannerContext.Provider>
  );
};
