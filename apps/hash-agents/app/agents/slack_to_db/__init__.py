"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""
import json
import os
from pathlib import Path

import openai
import structlog
from beartype import beartype
from qdrant_client import QdrantClient
from qdrant_client.http.models import Batch, VectorParams

logger = structlog.stdlib.get_logger(__name__)

COLLECTION_NAME = "SlackMessages"


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
    except:  # noqa E722
        logger.info("Creating collection", collection_name=COLLECTION_NAME)
        qdrant_client.create_collection(
            COLLECTION_NAME,
            vectors_config=VectorParams(
                size=1536,
                distance="Cosine",
            ),
        )

    embeddings = [
        {
            "ts": message_ts,
            "embedding": openai.Embedding.create(
                input=json.dumps(message),
                model=embedding_model,
            )["data"][0]["embedding"],
            "message": message,
        }
        for [message_ts, message] in messages.items()
    ]

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

    # Qdrant IDs have to be unsigned integers, or UUIDs, and Slack message IDs are timestamps expressed as UTC epoch
    # values (floats). If we take the timestamp to a specific precision, we can fit it into a 64-bit unsigned integer.
    # The timestamps are strings, so we can just remove the decimal point and convert to an integer.
    ids = [int(timestamp.replace(".", "")) for timestamp in timestamps]

    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=Batch(
            ids=ids,
            vectors=vectors,
            payloads=payloads,
        ),
        wait=True,
    )
    logger.info("Upserted embeddings into collection", collection_name=COLLECTION_NAME)
