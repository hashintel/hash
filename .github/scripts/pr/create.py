from textwrap import dedent

from template import TITLE, SECTIONS, Section, Item


def render_item(item: Item) -> str:
    mark = "x" if item["checked"] else " "
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

{render_sections(SECTIONS)}
"""

print(content)
