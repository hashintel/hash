import type { SiteProductionTimeline } from "@local/hash-isomorphic-utils/site-production-timeline";

export const loadSiteProductionTimeline = ({
  fetchTimeline,
  isCurrent,
  onError,
  onSettled,
  onStart,
  onSuccess,
  siteId,
}: {
  fetchTimeline: (siteId: string) => Promise<SiteProductionTimeline>;
  isCurrent: () => boolean;
  onError: (error: unknown) => void;
  onSettled: () => void;
  onStart: () => void;
  onSuccess: (timeline: SiteProductionTimeline) => void;
  siteId: string;
}): Promise<void> => {
  onStart();
  return fetchTimeline(siteId)
    .then((timeline) => {
      if (isCurrent() && timeline.site_id === siteId) {
        onSuccess(timeline);
      }
    })
    .catch((error: unknown) => {
      if (isCurrent()) {
        onError(error);
      }
    })
    .finally(() => {
      if (isCurrent()) {
        onSettled();
      }
    });
};
