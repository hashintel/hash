"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

import os

import openai
import requests
from beartype import beartype
from qdrant_client import QdrantClient

from .io_types import Input, Output

COLLECTION_NAME = "SlackMessages"
EMBEDDING_MODEL = "text-embedding-ada-002"


def search_bing(query):
    api_key = os.getenv("BING_API_KEY")

    url = f"https://api.bing.microsoft.com/v7.0/search?q={query}"
    headers = {"Ocp-Apim-Subscription-Key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()


def get_related_documents(
    prompt: str,
    qdrant_client: QdrantClient,
    limit: int,
) -> list[dict]:
    """Returns a list of related documents, given a prompt."""
    query_vector = openai.Embedding.create(
        input=prompt,
        model=EMBEDDING_MODEL,
    )[
        "data"
    ][0]["embedding"]

    return [
        result.payload
        for result in qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query=prompt,
            query_vector=query_vector,
            limit=limit,
        )
    ]


@beartype
def execute(agent_input: Input) -> Output:
    openai.api_key = os.getenv("OPENAI_API_KEY")
    qdrant_client = QdrantClient()

    while True:
        user_input = input("Ask the API a question, or type 'exit'...\n")

        if user_input == "exit":
            break

        related_documents = get_related_documents(user_input, qdrant_client, limit=1)
        print(related_documents)
