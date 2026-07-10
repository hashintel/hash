type GetInboxHrefParams = {
  includeDraftEntityActions?: boolean;
  numberOfDraftEntityActions?: number;
  numberOfPendingInvites?: number;
  numberOfUnreadNotifications?: number;
  fallbackHref: string;
};

export const getInboxHref = ({
  fallbackHref,
  includeDraftEntityActions = true,
  numberOfDraftEntityActions = 0,
  numberOfPendingInvites = 0,
  numberOfUnreadNotifications = 0,
}: GetInboxHrefParams) => {
  if (includeDraftEntityActions && numberOfDraftEntityActions > 0) {
    return "/actions";
  }

  if (numberOfUnreadNotifications > 0) {
    return "/notifications";
  }

  if (numberOfPendingInvites > 0) {
    return "/invites";
  }

  return fallbackHref;
};
