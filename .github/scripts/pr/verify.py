"""
Verify that the PR has the correct number of items checked in each section.

Usage:
    verify.py <content>

Arguments:
    <content>  The content of the PR body.

Exit codes:
    0: Success
    1: Invalid arguments
    2: Unknown section
    3: Too few items checked
    4: Too many items checked
"""
import sys

from template import SECTIONS

if len(sys.argv) != 2:
    print(__doc__.strip(), file=sys.stderr)
    sys.exit(1)

CONTENT = sys.argv[1]

# Split on every `\n##` to get the sections
# Split on every `\n-` to get the items


def parse_item(item: str) -> tuple[str, bool]:
    item = item.strip()
    item = item.removeprefix("[")
    checked, item = item.split("] <!-- ", 1)
    item_id, _ = item.split(" --> ", 1)

    return item_id, checked == "x"


def parse_section(section: str) -> dict[str, bool]:
    section = section.strip()
    section = section.removeprefix("<!-- ")
    section_id, _ = section.split(" -->", 1)

    items = section.split("\n-")[1:]

    return {item_id: checked for item_id, checked in map(parse_item, items)}


def parse(content: str) -> dict[str, dict[str, bool]]:
    sections = content.split("\n##")[1:]

    return {section_id: section for section_id, section in map(parse_section, sections)}


state = parse(CONTENT)


def verify_section(section_id: str, section: dict[str, bool]) -> bool:
    definition = [section for section in SECTIONS if section["id"] == section_id]

    if not definition:
        print(f"Unknown section: {section_id}", file=sys.stderr)
        sys.exit(2)

    definition = definition[0]

    checked = sum(item_id for item_id, checked in section.items() if checked)

    if checked < definition["validation"]["min"]:
        print(f"Section {section_id} has too few items checked", file=sys.stderr)
        sys.exit(3)

    if (
        definition["validation"]["max"] is not None
        and checked > definition["validation"]["max"]
    ):
        print(f"Section {section_id} has too many items checked", file=sys.stderr)
        sys.exit(4)


def verify(sections: dict[str, dict[str, bool]]):
    for section_id, section in sections.items():
        verify_section(section_id, section)


verify(state)
