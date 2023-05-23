from collections import namedtuple
from queue import Queue

from notion_client import Client
from notion_client.helpers import collect_paginated_api

NotionBlockResult = namedtuple(
    "NotionBlockResult",
    ["content", "block_ids", "sub_pages"],
)


def traverse_notion_block(
    notion_client: Client,
    task_queue: Queue,
    block_id,
) -> NotionBlockResult:
    print(f"Getting children blocks of {block_id}")

    paginated_contents = collect_paginated_api(
        notion_client.blocks.children.list,
        block_id=block_id,
    )

    block_ids = []
    sub_pages = []
    content = ""

    for page in paginated_contents:
        result_obj = page[page["type"]]

        cur_result_text_arr = []
        if "rich_text" in result_obj:
            for rich_text in result_obj["rich_text"]:
                # skip if doesn't have text object
                if "text" in rich_text:
                    text = rich_text["text"]["content"]
                    cur_result_text_arr.append(text)
                elif "plain_text" in rich_text:
                    text = rich_text["plain_text"]
                    cur_result_text_arr.append(text)
        elif "title" in result_obj:
            text = result_obj["title"]
            cur_result_text_arr.append(text)

        if page["has_children"]:
            task_queue.put(page["id"])
            if page["type"] == "child_page":
                sub_pages.append(page["id"])
            else:
                block_ids.append(page["id"])

        content += f"\n{' '.join(cur_result_text_arr)}"

    return NotionBlockResult(content=content, block_ids=block_ids, sub_pages=sub_pages)


import concurrent.futures
import os
import queue
import threading

from notion_client import Client

integration_token = os.getenv("NOTION_API_KEY")
page_ids = ["964db53ace9940519613dce0485820fd"]

notion_client = Client(auth=integration_token)

executor = concurrent.futures.ThreadPoolExecutor()
task_queue = queue.Queue()
results = {}


def process_queue():
    while True:
        block_id = task_queue.get()
        results[block_id] = executor.submit(
            traverse_notion_block,
            notion_client,
            task_queue,
            block_id,
        )
        task_queue.task_done()


queue_thread = threading.Thread(target=process_queue)
queue_thread.start()

for page_id in page_ids:
    task_queue.put(page_id)

task_queue.join()

pages_to_explore = [*page_ids]
explored_pages = set()
pages_to_contents = {}


def collapse_text(root_block_id, depth):
    block_result = results[root_block_id].result()
    pages_to_explore.extend(block_result.sub_pages)

    block_content = block_result.content
    nested_content = "\n".join(
        [collapse_text(block_id, depth + 1) for block_id in block_result.block_ids],
    )
    return (depth * "\t") + block_content + nested_content


while len(pages_to_explore) > 0:
    page_id = pages_to_explore.pop(0)
    if page_id in explored_pages:
        continue
    explored_pages.add(page_id)

    print(f"Exploring page {page_id}")
    pages_to_contents[page_id] = collapse_text(page_id, 0)
