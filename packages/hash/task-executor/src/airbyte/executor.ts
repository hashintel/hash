import { executeTask } from "../execution";
import { AirbyteMessage } from "./protocol";

interface AirbyteExecutor {
  imageName: string;

  runSpec(): Promise<AirbyteMessage>;
  runCheck(config_path: string): Promise<AirbyteMessage>;
  runDiscover(config_path: string): Promise<AirbyteMessage>;
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

  async runSpec(): Promise<AirbyteMessage> {
    const response = await executeTask("docker", [
      "run",
      "--rm",
      this.imageName,
      "spec",
    ]);

    return JSON.parse(response);
  }

  async runCheck(config_path: string): Promise<AirbyteMessage> {
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

    return JSON.parse(response);
  }

  async runDiscover(config_path: string): Promise<AirbyteMessage> {
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

    return JSON.parse(response);
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

    return JSON.parse(response);
  }
}
