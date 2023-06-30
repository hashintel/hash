"""Temporal activities available to workflows."""
import os

import openai
from temporalio import activity


@activity.defn
async def complete(prompt: str) -> str:
    """Completes a prompt using the OpenAI API."""
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    completion = await openai.Completion.acreate(  # type: ignore[reportUnknownMemberType]  # noqa: E501
        model="ada",
        prompt=prompt,
        temperature=0,
        max_tokens=10,
    )

    # We suspect that due to the Temporal decorator, we must explicitly bind
    # the return value before returning it.
    # If we don't do this, the activity will mysteriously fail.
    text_response = completion["choices"][0]["text"]  # type: ignore[reportGeneralTypeIssues]  # noqa: E501

    if not isinstance(text_response, str):
        # TODO: activities should never raise an exception, but instead return
        #  an error value that the workflow can handle.
        #  https://app.asana.com/0/0/1204934059777411/f
        msg = f"Expected str, got {type(text_response)}"  # type: ignore[reportUnknownMemberType]  # noqa: E501
        raise TypeError(msg)

    return text_response
