import { Logger } from "@local/hash-backend-utils/logger";
import fetch from "node-fetch";

import { VectorDb } from "./vector";

export type QdrantConfig = {
  host: string;
  port: number;
};

export class QdrantDb implements VectorDb {
  private url: string;
  constructor(private logger: Logger, private config: QdrantConfig) {
    this.url = `http://${this.config.host}:${this.config.port}`;
  }

  async createIndex(
    indexName: string,
    dimensions: number = 1536,
    distance: "Cosine" | "Dot" | "Euclid" = "Cosine",
  ) {
    // https://qdrant.tech/documentation/collections/#create-collection
    await fetch(`${this.url}/collections/${indexName}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: indexName,
        vectors: {
          size: dimensions,
          distance,
        },
      }),
    })
      .then((data) => this.logger.debug("Created collection: ", data))
      .catch((err) => this.logger.error("Could not create index: ", err));
    this.logger.info("Created index: ", {
      name: indexName,
      dimensions,
      distance,
    });
  }

  async indexVectors(
    indexName: string,
    points: {
      id: string;
      payload: unknown;
      vector: number[];
    }[],
  ) {
    // https://qdrant.tech/documentation/points/#upload-points
    await fetch(`${this.url}/collections/${indexName}/points`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ points }),
    }).catch((err) => this.logger.error("Could not insert entity: ", err));
  }
}
