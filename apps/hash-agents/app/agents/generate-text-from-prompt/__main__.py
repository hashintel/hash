import json

import structlog.stdlib
from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

from .io_types import Input, Output

logger = structlog.stdlib.get_logger(__name__)

SYSTEM_MESSAGE_CONTENT = (
    "You are a text generator. Given a topic or a question, generate a"
    "paragraph of text accurately describing the given topic or answering the"
    " question. You must be concise."
)

def main(agent_input: Input) -> Output:
    chat = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)

    messages = [
        HumanMessage(
            content=agent_input.prompt
        ),
    ]

    response = chat(messages)

    logger.info(response=response.content)

    # TODO - validate the response

    return Output(response.content)


if __name__ == "HASH":
    global IN, OUT
    OUT = main(IN)  # noqa: F821

if __name__ == "__main__":
    from ... import setup

    setup("dev")

    output = main(
        Input(
            prompt="What is the meaning of life?"
        )
    )

    logger.info(output=output)
