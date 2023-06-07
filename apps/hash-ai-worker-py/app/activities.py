"""Temporal activities available to workflows."""
import os

import openai
from temporalio import activity


@activity.defn
async def complete(prompt: str) -> str:
    """Completes a prompt using the OpenAI API."""
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    completion = await openai.Completion.acreate(
        model="ada",
        prompt=prompt,
        temperature=0,
        max_tokens=10,
    )

    # We suspect that due to the Temporal decorator, we must explicitly bind
    # the return value before returning it.
    # If we don't do this, the activity will mysteriously fail.
    text_response = completion["choices"][0]["text"]

    return text_response  # noqa: RET504
