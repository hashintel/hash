from repo_chores.constraints._engine import Workspace


def enforce_ruff_source_roots(workspace: Workspace) -> None:
    workspace.ruff.source_roots = workspace.member_module_roots()
