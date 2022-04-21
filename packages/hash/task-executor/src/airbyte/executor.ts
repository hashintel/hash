import { executeTask } from "../execution";
import { parse_message_stream } from "./parsing";
import {
  AirbyteConnectionStatus,
  AirbyteMessage,
  AirbyteStream,
  ConnectorSpecification,
} from "./protocol";

interface AirbyteExecutor {
  imageName: string;

  runSpec(): Promise<ConnectorSpecification>;
  runCheck(config_path: string): Promise<AirbyteConnectionStatus>;
  runDiscover(config_path: string): Promise<AirbyteStream[]>;
  runRead(
    config_path: string,
    configured_catalog_path: string,
    state_path?: string,
  ): Promise<AirbyteMessage>;
}

export class BaseExecutor implements AirbyteExecutor {
  imageName;

  constructor(imageName: string) {
    this.imageName = imageName;
  }

  async runSpec(): Promise<ConnectorSpecification> {
    const response = await executeTask("docker", [
      "run",
      "--rm",
      this.imageName,
      "spec",
    ]);

    const messages = parse_message_stream(response);

    const spec_message = messages.find(
      (message) => message.type === "SPEC" && message.spec,
    );
    if (spec_message) {
      return spec_message.spec!;
    } else {
      throw new Error("Message didn't contain a ConnectorSpecification");
    }
  }

  async runCheck(config_path: string): Promise<AirbyteConnectionStatus> {
    const response = await executeTask("docker", [
      "run",
      "--rm",
      "-v",
      `${config_path}:/secrets/config.json`,
      this.imageName,
      "check",
      "--config",
      "/secrets/config.json",
    ]);

    const messages = parse_message_stream(response);

    const status_message = messages.find(
      (message) =>
        message.type === "CONNECTION_STATUS" && message.connectionStatus,
    );
    if (status_message) {
      return status_message.connectionStatus!;
    } else {
      throw new Error("Message didn't contain a AirbyteConnectionStatus");
    }
  }

  async runDiscover(config_path: string): Promise<AirbyteStream[]> {
    const response = await executeTask("docker", [
      "run",
      "--rm",
      "-v",
      `${config_path}:/secrets/config.json`,
      this.imageName,
      "discover",
      "--config",
      "/secrets/config.json",
    ]);

    const messages = parse_message_stream(response);

    const catalog_message = messages.find(
      (message) => message.type === "CATALOG" && message.catalog,
    );
    if (catalog_message) {
      return catalog_message.catalog!.streams;
    } else {
      throw new Error("Message didn't contain a Airbyte Catalog");
    }
  }

  async runRead(
    config_path: string,
    configured_catalog_path: string,
    state_path?: string,
  ): Promise<AirbyteMessage> {
    const args = [
      "run",
      "--rm",
      "-v",
      `${config_path}:/secrets/config.json`,
      `${configured_catalog_path}:/secrets/catalog.json`,
      this.imageName,
      "read",
      "--config",
      "/secrets/config.json",
      "--catalog",
      "/secrets/catalog.json",
    ];

    if (state_path) {
      args.push("--state", state_path);
    }

    const response = await executeTask("docker", args);

    const stream = JSON.parse(response);
    console.log(stream);
    // todo
    throw new Error();
  }
}
