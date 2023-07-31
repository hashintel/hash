from typing import TypedDict

TITLE: str = "Pre-Merge Checklist 🚀"


class SectionValidation(TypedDict):
    min: int
    max: int | None


class Item(TypedDict):
    id: str

    checked: bool
    title: str
    description: str | None


class Section(TypedDict):
    id: str

    emoji: str
    title: str

    description: str | None

    items: list[Item]
    validation: SectionValidation


SECTIONS: list[Section] = [
    Section(
        id="publish",
        emoji="🚢",
        title="Has this modified a publishable library?",
        description=(
            "Confirm you have taken the necessary action to record a changeset "
            "or publish a change, as appropriate"
        ),
        items=[
            Item(
                id="publish-npm",
                checked=False,
                title=(
                    "modifies an **npm**-publishable library and "
                    "**I have added a changeset file(s)**"
                ),
                description=None,
            ),
            Item(
                id="publish-cargo-publish",
                checked=False,
                title=(
                    "modifies a **Cargo**-publishable library "
                    "and **I have amended the version**"
                ),
                description=None,
            ),
            Item(
                id="publish-cargo-develop",
                checked=False,
                title=(
                    "modifies a **Cargo**-publishable library, "
                    "but **it is not yet ready to publish**"
                ),
                description=None,
            ),
            Item(
                id="publish-block",
                checked=False,
                title=(
                    "modifies a **block** that will need publishing "
                    "via GitHub action once merged"
                ),
                description=None,
            ),
            Item(
                id="publish-none",
                checked=False,
                title=(
                    "does not modify any publishable blocks or libraries, "
                    "or modifications do not need publishing"
                ),
                description=None,
            ),
            Item(
                id="publish-unknown",
                checked=True,
                title="I am unsure / need advice",
                description=None,
            ),
        ],
        validation={"min": 1, "max": None},
    ),
    Section(
        id="docs",
        emoji="📖",
        title="Does this require a change to the docs?",
        description=(
            "If this adds a user facing feature or "
            "modifies how an existing feature is used, "
            "it likely needs a docs change."
        ),
        items=[
            Item(
                id="docs-internal",
                checked=False,
                title="are internal and do not require a docs change",
                description=None,
            ),
            Item(
                id="docs-not-yet-required",
                checked=False,
                title=(
                    "are in a state where docs changes are "
                    "not _yet_ required but will be"
                ),
                description="- this is tracked in: [Insert Link Here](link)",
            ),
            Item(
                id="docs-required",
                checked=False,
                title="require changes to docs which **are made** as part of this PR",
                description=None,
            ),
            Item(
                id="docs-required-later",
                checked=False,
                title="require changes to docs which are **not** made in this PR",
                description="- _Provide more details here_",
            ),
            Item(
                id="docs-unknown",
                checked=True,
                title="I am unsure / need advice",
                description=None,
            ),
        ],
        validation={"min": 1, "max": None},
    ),
    Section(
        id="turbo",
        emoji="🕸️",
        title="Does this require a change to the Turbo Graph?",
        description=(
            "If this adds or moves an existing package, "
            "modifies `scripts` in a `package.json`, "
            "it likely needs a turbo graph change."
        ),
        items=[
            Item(
                id="turbo-affected",
                checked=False,
                title=(
                    "affected the execution graph, "
                    "and the `turbo.json`'s have been updated to reflect this"
                ),
                description=None,
            ),
            Item(
                id="turbo-unaffected",
                checked=False,
                title="do not affect the execution graph",
                description=None,
            ),
            Item(
                id="turbo-unknown",
                checked=True,
                title="I am unsure / need advice",
                description=None,
            ),
        ],
        validation={"min": 1, "max": None},
    ),
]
