"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

import os
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pprint import pprint

import structlog
from beartype import beartype
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from slack_sdk.web import SlackResponse

logger = structlog.stdlib.get_logger(__name__)

HASH_GRAPH_CHANNEL_ID = "C03F7V6DU9M"
MESSAGES_PER_PAGE = 1_000
# It wants a _string_ of the epoch timestamp (number)...
OLDEST = str((datetime.now(tz=timezone.utc) - timedelta(days=1)).timestamp())


def handle_rate_limit(response_generator_func: Callable[[], SlackResponse]):
    response_generator = None

    while True:
        try:
            if response_generator is None:
                response_generator = iter(response_generator_func())
            response = next(response_generator)
            response.validate()
            yield response
        except StopIteration:
            break
        except SlackApiError as error:
            if error.response.status_code != 429:
                raise
            retry_after = int(error.response.headers["Retry-After"])
            logger.warning("Rate limited, retrying", retry_after=retry_after)
            time.sleep(retry_after)
            continue


def extract_messages(response: SlackResponse):
    return [
        {
            "text": message["text"],
            "user": message["user"],
            "ts": message["ts"],
        }
        for message in response["messages"]
        if message["type"] == "message"
    ]


def get_threaded_replies(client: WebClient, channel_id, thread_ts):
    replies = []
    for response in handle_rate_limit(
        lambda: client.conversations_replies(
            channel=channel_id,
            ts=thread_ts,
            limit=MESSAGES_PER_PAGE,
            oldest=OLDEST,
        ),
    ):
        response.validate()
        replies.extend(response["messages"][1:])  # Exclude the parent message

    return replies


@beartype
def execute() -> None:
    api_key = os.getenv("SLACK_API_KEY")
    client = WebClient(token=api_key)

    page = 0

    messages = []

    for response in handle_rate_limit(
        lambda: client.conversations_history(
            channel=HASH_GRAPH_CHANNEL_ID,
            limit=MESSAGES_PER_PAGE,
            oldest=OLDEST,
        ),
    ):
        page += 1

        logger.info(
            "Retrieving page of channel history history",
            page=page,
            channel=HASH_GRAPH_CHANNEL_ID,
        )
        response.validate()
        messages.extend(extract_messages(response))

    for message in messages:
        message["replies"] = get_threaded_replies(
            client,
            HASH_GRAPH_CHANNEL_ID,
            message["ts"],
        )

    pprint(messages)
