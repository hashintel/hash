"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

import json
import os
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
from beartype import beartype
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from slack_sdk.web import SlackResponse

logger = structlog.stdlib.get_logger(__name__)

MESSAGES_PER_PAGE = 1_000
# It wants a _string_ of the epoch timestamp (number)...
# OLDEST = str((datetime.now(tz=timezone.utc) - timedelta(days=7)).timestamp())
OLDEST = str((datetime.now(tz=timezone.utc) - timedelta(days=30)).timestamp())
# OLDEST = str((datetime.now(tz=timezone.utc) - timedelta(days=180)).timestamp())


def handle_rate_limit(response_generator_func: Callable[[], SlackResponse]):
    response_generator = None

    while True:
        try:
            if response_generator is None:
                response_generator = iter(response_generator_func())
            response = next(response_generator)
            response.validate()
            yield response
            response_generator = response

        except StopIteration:
            break
        except SlackApiError as error:
            if error.response.status_code != 429:
                raise
            retry_after = int(error.response.headers["Retry-After"])
            logger.debug("Rate limited, retrying", retry_after=retry_after)
            time.sleep(retry_after)
            continue


def extract_messages(messages):
    return [
        # TODO: extract file information, etc. here
        {
            "text": message["text"],
            "user": message["user"],
            "ts": message["ts"],
        }
        for message in messages
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
        replies.extend(
            extract_messages(response["messages"][1:]),
        )  # Exclude the parent message

    return replies


@beartype
def execute() -> None:
    api_key = os.getenv("SLACK_API_KEY")
    client = WebClient(token=api_key)

    channels = client.conversations_list(
        types="public_channel",
        limit=1000,
        exclude_archived=True,
    )["channels"]

    # TODO: this tried sorting by last message, it's slow because it requires a lot of calls, and it's somewhat not
    #   helpful because some of the channels contain a lot of activity from bots, etc.

    # for channel in channels:
    #     history = client.conversations_history(
    #         channel=channel["id"],
    #         limit=1,
    #     )["messages"]r
    #     channel["last_message_ts"] = history[0]["ts"] if len(history) > 0 else 0
    #
    # channels = sorted(
    #     channels,
    #     key=lambda channel: channel["last_message_ts"],
    #     reverse=True,
    # )

    channels = sorted(
        channels,
        key=lambda channel: channel["name"],
        reverse=False,
    )

    print("Channels:")  # noqa: T201
    for channel in channels:
        print(channel["name"], channel["id"])  # noqa: T201

    channel_id = None

    while channel_id is None:
        channel_identifier = input(
            "Choose a channel to ingest by either specifying a name or ID: ",
        )
        for channel in channels:
            if (
                channel["name"] == channel_identifier
                or channel["id"] == channel_identifier
            ):
                channel_id = channel["id"]
                break

    page = 0

    messages = {}

    for response in handle_rate_limit(
        lambda: client.conversations_history(
            channel=channel_id,
            limit=MESSAGES_PER_PAGE,
            oldest=OLDEST,
        ),
    ):
        page += 1

        logger.info(
            "Retrieving page of channel history history",
            page=page,
            channel=channel_id,
        )
        response.validate()

        for message in extract_messages(response["messages"]):
            messages[message["ts"]] = message

    logger.info(
        "Finished retrieving messages in channel",
        num_messages=len(messages),
        channel=channel_id,
    )

    message_ts_to_replies = {}

    for message_ts in messages:
        logger.debug("Retrieving replies for message", message_ts=message_ts)
        message_ts_to_replies[message_ts] = get_threaded_replies(
            client,
            channel_id,
            message_ts,
        )

    logger.info(
        "Finished retrieving all threads for messages",
        total_replies=sum(map(len, message_ts_to_replies.values())),
    )

    Path("out").mkdir(exist_ok=True)
    Path("out/messages.json").write_text(
        json.dumps(
            {"messages": messages, "message_ts_to_replies": message_ts_to_replies},
            indent=2,
        ),
    )
