import { executeTask } from "../execution";
import { parseMessageStream } from "./parsing";
import {
  AirbyteConnectionStatus,
  AirbyteMessage,
  AirbyteStream,
  ConfiguredAirbyteCatalog,
  ConnectorSpecification,
} from "./protocol";
import { writeToTempFile } from "./temp-io";

type RecordMessage = AirbyteMessage["record"];

interface AirbyteExecutor {
  imageName: string;

  runSpec(): Promise<ConnectorSpecification>;
  runCheck(config: any): Promise<AirbyteConnectionStatus>;
  runDiscover(config: any): Promise<AirbyteStream[]>;
  runRead(
    config: any,
    configuredCatalog: ConfiguredAirbyteCatalog,
    statePath?: string,
  ): Promise<RecordMessage[]>;
}

const CONFIG_FILE_NAME = "config.json";
const CATALOG_FILE_NAME = "catalog.json";

/** @todo - Handle Airbyte outputs as a stream so we get progress indication from the log messages */
/** @todo - Don't ignore Airbyte Log messages */

export class BaseExecutor implements AirbyteExecutor {
  imageName;

  constructor(imageName: string) {
    this.imageName = imageName;
  }

  async runSpec(): Promise<ConnectorSpecification> {
    const response = await executeTask("docker", [
      "run",
      // "--rm",
      this.imageName,
      "spec",
    ]);

    const messages = parseMessageStream(response);

    const specMessage = messages.find(
      (message) => message.type === "SPEC" && message.spec,
    );
    if (specMessage) {
      return specMessage.spec!;
    } else {
      throw new Error("Message didn't contain a ConnectorSpecification");
    }
  }

  async runCheck(config: any): Promise<AirbyteConnectionStatus> {
    const configPath = await writeToTempFile(
      CONFIG_FILE_NAME,
      JSON.stringify(config),
    );

    const response = await executeTask("docker", [
      "run",
      // "--rm",
      "-v",
      `task-executor-secrets:/var/run/task-executor-secrets`,
      this.imageName,
      "check",
      "--config",
      configPath,
    ]);

    const messages = parseMessageStream(response);

    const statusMessage = messages.find(
      (message) =>
        message.type === "CONNECTION_STATUS" && message.connectionStatus,
    );
    if (statusMessage) {
      return statusMessage.connectionStatus!;
    } else {
      throw new Error("Message didn't contain a AirbyteConnectionStatus");
    }
  }

  async runDiscover(config: any): Promise<AirbyteStream[]> {
    const configPath = await writeToTempFile(
      CONFIG_FILE_NAME,
      JSON.stringify(config),
    );

    const response = await executeTask("docker", [
      "run",
      // "--rm",
      "-v",
      `task-executor-secrets:/var/run/task-executor-secrets`,
      this.imageName,
      "discover",
      "--config",
      configPath,
    ]);

    const messages = parseMessageStream(response);

    const catalogMessage = messages.find(
      (message) => message.type === "CATALOG" && message.catalog,
    );
    if (catalogMessage) {
      return catalogMessage.catalog!.streams;
    } else {
      throw new Error("Message didn't contain a Airbyte Catalog");
    }
  }

  async runRead(
    config: any,
    configuredCatalog: ConfiguredAirbyteCatalog,
    statePath?: string,
  ): Promise<RecordMessage[]> {
    const configPath = await writeToTempFile(
      CONFIG_FILE_NAME,
      JSON.stringify(config),
    );
    const catalogPath = await writeToTempFile(
      CATALOG_FILE_NAME,
      JSON.stringify(configuredCatalog),
    );

    const args = [
      "run",
      // "--rm",
      "-v",
      `task-executor-secrets:/var/run/task-executor-secrets`,
      this.imageName,
      "read",
      "--config",
      configPath,
      "--catalog",
      catalogPath,
    ];

    if (statePath) {
      args.push("--state", statePath);
    }

    const response = await executeTask("docker", args);

    const messages = parseMessageStream(response);
    console.log(`Read ${messages.length} messages from Airbyte`);

    const recordMessages = messages
      .filter((message) => message.type === "RECORD" && message.record)
      .map((message) => message.record!);
    if (recordMessages.length > 0) {
      console.log(`There were ${recordMessages.length} records`);
      return recordMessages;
    } else {
      throw new Error("Message didn't contain any Airbyte Records");
    }
  }
}
