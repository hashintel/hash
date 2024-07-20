import type proto from "@temporalio/proto";

export const parseHistoryItemPayload = (
  inputOrResults: proto.temporal.api.common.v1.IPayloads | null | undefined,
) =>
  inputOrResults?.payloads
    ?.map(({ data }) => {
      if (!data?.toString()) {
        return data;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(data.toString());
      } catch {
        return data.toString();
      }
    })
    .filter((item) => item !== undefined);
