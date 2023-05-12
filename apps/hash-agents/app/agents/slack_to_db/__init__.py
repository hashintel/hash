import concurrent.futures
import json
import os
from pathlib import Path

import openai
import structlog
from beartype import beartype
from qdrant_client import QdrantClient
from qdrant_client.http.models import Batch, VectorParams
from tenacity import (
    retry,
    stop_after_attempt,
    wait_random_exponential,
)

logger = structlog.stdlib.get_logger(__name__)

COLLECTION_NAME = "SlackMessages"


@retry(wait=wait_random_exponential(min=1, max=60), stop=stop_after_attempt(10))
def create_embedding_with_backoff(**kwargs):
    return openai.Embedding.create(**kwargs)


@beartype
def execute() -> None:
    openai.api_key = os.getenv("OPENAI_API_KEY")

    slack_data = json.loads(Path("out/messages.json").read_text())

    root_messages = slack_data["messages"]
    root_message_ts_to_replies = slack_data["message_ts_to_replies"]

    messages = {
        **root_messages,
        **{
            reply["ts"]: reply
            for replies in root_message_ts_to_replies.values()
            for reply in replies
        },
    }

    logger.info("Loaded messages", num_messages=len(messages))

    qdrant_client = QdrantClient()
    embedding_model = "text-embedding-ada-002"

    try:
        qdrant_client.get_collection(COLLECTION_NAME)
        logger.info("Found existing collection", collection_name=COLLECTION_NAME)
    except:  # E722
        logger.info("Creating collection", collection_name=COLLECTION_NAME)
        qdrant_client.create_collection(
            COLLECTION_NAME,
            vectors_config=VectorParams(
                size=1536,
                distance="Cosine",
            ),
        )

    def create_embedding(message_ts, message, num: int | None, total: int | None):
        logger.debug("Creating embedding", message_ts=message_ts, num=num, total=total)
        embedding = create_embedding_with_backoff(
            input=json.dumps(message),
            model=embedding_model,
        )["data"][0]["embedding"]
        return {
            "ts": message_ts,
            "embedding": embedding,
            "message": message,
        }

    with concurrent.futures.ThreadPoolExecutor() as executor:
        embeddings = list(
            executor.map(
                lambda idx_item: create_embedding(
                    *idx_item[1],
                    num=idx_item[0],
                    total=len(messages),
                ),
                enumerate(messages.items()),
            ),
        )

    logger.info("Created embeddings", num_embeddings=len(embeddings))

    timestamps, vectors, payloads = zip(
        *[
            (
                embedding["ts"],
                embedding["embedding"],
                embedding["message"],
            )
            for embedding in embeddings
        ],
        strict=True,
    )

    ids = [int(timestamp.replace(".", "")) for timestamp in timestamps]

    Path("out/embeddings.json").write_text(
        json.dumps(
            {"ids": ids, "vectors": vectors, "payloads": payloads},
            indent=2,
        ),
    )

    # embeddings = json.loads(Path("out/embeddings.json").read_text())
    # ids = embeddings["ids"]
    # vectors = embeddings["vectors"]
    # payloads = embeddings["payloads"]

    batch_size = 500
    for batch_start in range(0, len(ids), batch_size):
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=Batch(
                ids=ids[batch_start : batch_start + batch_size],
                vectors=vectors[batch_start : batch_start + batch_size],
                payloads=payloads[batch_start : batch_start + batch_size],
            ),
            wait=False,
        )
        logger.info(
            "Upserted embeddings into collection",
            collection_name=COLLECTION_NAME,
            batch_start=batch_start,
            batch_size=batch_size,
        )
