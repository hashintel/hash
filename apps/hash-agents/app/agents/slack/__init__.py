"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

import os
from datetime import datetime, timedelta, timezone
from pprint import pprint

from beartype import beartype
from slack_sdk import WebClient
from slack_sdk.web import SlackResponse

HASH_GRAPH_CHANNEL_ID = "C03F7V6DU9M"


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


@beartype
def execute() -> None:
    api_key = os.getenv("SLACK_API_KEY")
    client = WebClient(token=api_key)

    # It wants a _string_ of the epoch timestamp (number)...
    yesterday = str((datetime.now(tz=timezone.utc) - timedelta(days=1)).timestamp())

    response = client.conversations_history(
        channel=HASH_GRAPH_CHANNEL_ID,
        oldest=yesterday,
        limit=10,
    )

    channel_history = extract_messages(response)

    pprint(channel_history)
