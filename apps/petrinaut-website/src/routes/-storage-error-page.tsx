import { StatusPage } from "../shared/status-page";

/** Shown when the browser refuses to save the net a route was opening. */
export const StorageErrorPage = () => (
  <StatusPage
    title="Couldn't save a document"
    body="Petrinaut saves documents in this browser, and the browser refused. Free up browser storage or allow this site to store data, then reload."
  />
);
