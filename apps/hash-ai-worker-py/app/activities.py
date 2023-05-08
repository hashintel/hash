import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import timedelta
from temporalio import activity

import openai


@activity.defn
async def complete(prompt: str) -> str:
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    completion = await openai.Completion.acreate(
        model="ada", prompt=prompt, temperature=0, max_tokens=500
    )
    return completion.choices[0].text
