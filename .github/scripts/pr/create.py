"""
This script generates the content for a comment on a pull request for a pre-defined checklist.

The checklist is defined in `template.py` and the content is generated from that file.
If a single override is provided, all items will be unchecked except for the item with the
given ID.

Usage:
    create.py [--override=<item-id>]...

Options:
    --override=<item-id>  Override the checked state of an item.

Exit codes:
    0: Success
    1: Invalid arguments
"""
import argparse
import sys

from template import TITLE, SECTIONS, Section, Item

parser = argparse.ArgumentParser(description=__doc__.strip())
parser.add_argument(
    "--override",
    action="append",
    dest="overrides",
    metavar="<item-id>",
    help="Override the checked state of an item.",
)

result = parser.parse_args(sys.argv[1:])
OVERRIDE = result.overrides or []


def item_checked(item: Item) -> bool:
    if not OVERRIDE:
        return item["checked"]

    return item["id"] in OVERRIDE


def render_item(item: Item) -> str:
    mark = "x" if item_checked(item) else " "
    description = f"\n    {item['description']}" if item["description"] else ""

    return f"""- [{mark}] <!-- {item["id"]} --> {item["title"]}{description}"""


def render_items(items: list[Item]) -> str:
    return "\n\n".join(render_item(item) for item in items)


def render_section(section: Section) -> str:
    description = f"\n> {section['description']}" if section["description"] else ""

    return f"""## <!-- {section["id"]} --> {section["title"]}
{description}

{render_items(section["items"])}"""


def render_sections(sections: list[Section]) -> str:
    return "\n\n".join(render_section(section) for section in sections)


content = f"""# {TITLE}
<!-- Generated Checklist -->

{render_sections(SECTIONS)}
"""

print(content)
