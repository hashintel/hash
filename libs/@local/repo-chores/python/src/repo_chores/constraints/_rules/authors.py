from itertools import chain

from repo_chores.constraints._engine import Workspace


def enforce_authors(workspace: Workspace) -> None:
    for package in chain((workspace,), workspace.members):
        if package.name is None:
            continue

        authors = package.authors
        if not authors:
            authors.append(name="HASH")
        else:
            authors[0].name = "HASH"
            authors[0].email = None
            del authors[1:]
