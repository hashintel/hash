export type VoiceRequestRejection =
  | "method"
  | "origin"
  | "content-type"
  | "content-length";

export const guardVoiceRequest = (
  request: Request,
  contentType: string,
  maxBytes: number,
): VoiceRequestRejection | undefined => {
  if (request.method !== "POST") return "method";
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return "origin";
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== contentType
  )
    return "content-type";
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    return "content-length";
};
