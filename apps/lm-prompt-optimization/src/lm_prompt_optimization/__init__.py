def main() -> int:
    print("Hello from lm-prompt-optimization!")
    return 0

async def _async() -> int:
    import asyncio

    print("Sleeping for 1 second...")
    await asyncio.sleep(1)
    print("Hello from lm-prompt-optimization!")

    return 0

def async_example() -> int:
    import asyncio

    return asyncio.run(_async())
