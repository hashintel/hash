declare module "sync-fetch" {
  interface SyncResponse {
    json(): unknown;
    text(): string;
    buffer(): Buffer;
    arrayBuffer(): ArrayBuffer;
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
  }

  function fetch(url: string, options?: RequestInit): SyncResponse;
  export default fetch;
}
