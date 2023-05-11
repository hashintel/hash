import os
from temporalio import activity

import openai


@activity.defn
async def complete(prompt: str) -> str:
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    completion = await openai.Completion.acreate(
        model="ada", prompt=prompt, temperature=0, max_tokens=10
    )

    text_response = completion["choices"][0]["text"]

    return text_response
