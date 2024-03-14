import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { validateVersionedUrl } from "@blockprotocol/type-system/slim";

export const parseUrlForOntologyChip = (url: VersionedUrl) => {
  const validationResult = validateVersionedUrl(url);
  if (validationResult.type === "Err") {
    throw new Error(
      `Could not validate url as VersionedUrl: ${validationResult.inner.reason}`,
    );
  }
  const parsed = validationResult.inner;
  const parsedUrl = new URL(parsed);
  const domain =
    parsedUrl.host === "localhost:3000" ? "localhost" : parsedUrl.host;
  const path = parsedUrl.pathname.slice(1);

  return { domain, path };
};
