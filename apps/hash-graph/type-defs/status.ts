import { Status } from "@local/status/type-defs/status";
import {
  ErrorInfo,
  RequestInfo,
  ResourceInfo,
} from "@local/status/type-defs/status-payloads";

// We can't just import `Status` as a type alias as it confuses `quicktype`
export type GraphStatus = Status<ErrorInfo | RequestInfo | ResourceInfo>;
