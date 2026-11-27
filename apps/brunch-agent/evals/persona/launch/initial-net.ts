/**
 * A net to stage at the start of a run. Besides a Petrinaut file, it may be a
 * retained run's `evidence/net.json`: the website's stored document, which
 * holds the net in `sdcpn` beside its title.
 */
export const initialNetFileData = (data: unknown): unknown => {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return data;
  const { sdcpn, title } = data as Record<string, unknown>;
  return typeof sdcpn === "object" && sdcpn !== null && !Array.isArray(sdcpn)
    ? { ...sdcpn, title }
    : data;
};
