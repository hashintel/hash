"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

import json
import os
from pathlib import Path

import openai
import requests
import structlog
import trafilatura
from beartype import beartype
from qdrant_client import QdrantClient

from app.util import wrap_system_message, wrap_user_message
from app.util.count_tokens import num_tokens_from_messages

COLLECTION_NAME = "SlackMessages"
EMBEDDING_MODEL = "text-embedding-ada-002"
COMPLETION_MODEL = "gpt-3.5-turbo"


logger = structlog.stdlib.get_logger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as"
    " possible."
)


def get_search_prompt(threads, website_contents, user_input):
    return f"""\
Given the following information:
{json.dumps(threads)}
{website_contents}

Do your best to answer this explaining which bits of the information you have used to come to your \
conclusion, and directly quote the information where available:
{user_input}
"""


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


def get_thread_for_comment(
    comment: dict,
    root_messages: dict[str, dict],
    root_message_ts_to_replies: dict[str, list[dict]],
):
    root_comment_ts = (
        comment["ts"] if comment["ts"] in root_messages else comment["thread_ts"]
    )

    return [
        root_messages[root_comment_ts],
        *root_message_ts_to_replies[root_comment_ts],
    ]


def get_siblings_for_comment(
    comment: dict,
    root_messages: dict[str, dict],
    root_message_ts_to_replies: dict[str, list[dict]],
    num: int,
):
    if comment["ts"] in root_messages:
        return root_message_ts_to_replies[comment["ts"]][:num]

    root_comment_ts = comment["thread_ts"]
    thread = root_message_ts_to_replies[root_comment_ts]
    index = thread.index(comment)
    return thread[index - num : index + num + 1]


@beartype
def execute():
    openai.api_key = os.getenv("OPENAI_API_KEY")
    qdrant_client = QdrantClient()

    slack_data = json.loads(Path("out/messages.json").read_text())
    root_messages = slack_data["messages"]
    root_message_ts_to_replies = slack_data["message_ts_to_replies"]

    while True:
        user_input = input("Give a question, or type 'exit'...\n")

        if user_input == "exit":
            break

        related_documents = get_related_documents(user_input, qdrant_client, limit=3)
        bing_results = search_bing(user_input)

        contents = [
            trafilatura.extract(trafilatura.fetch_url(result["url"]))
            for result in bing_results["webPages"]["value"][
                :3
            ]  # only pick top 3 results
        ]

        contents = [content for content in contents if content is not None]

        website_contents = "\n".join(contents)[
            :1_000
        ]  # truncate the string to 1_000 chars to preserve token length

        # write website_contents to file
        with open("out/website_contents.json", "w") as f:
            json.dump(website_contents, f)

        logger.info(
            "Found web results",
            num_tokens=num_tokens_from_messages([wrap_user_message(website_contents)]),
        )

        threads = []
        for comment in related_documents:
            threads.append(comment)
            threads.extend(
                get_siblings_for_comment(
                    comment,
                    root_messages,
                    root_message_ts_to_replies,
                    num=6,
                ),
            )

        # remove duplicate comments
        threads = list({thread["ts"]: thread for thread in threads}.values())

        # write threads to file
        with open("out/threads.json", "w") as f:
            json.dump(threads, f)

        logger.info(
            "Found related threads",
            num_comments=sum(map(len, threads)),
            num_tokens=num_tokens_from_messages([wrap_user_message(f"{threads}")]),
        )

        response = openai.ChatCompletion.create(
            model=COMPLETION_MODEL,
            messages=[
                wrap_system_message(DEFAULT_SYSTEM_PROMPT),
                wrap_user_message(
                    get_search_prompt(threads, website_contents, user_input),
                ),
            ],
            temperature=0,
            # max_tokens=self.max_tokens_per_response,
        )

        print(response["choices"][0]["message"]["content"])
