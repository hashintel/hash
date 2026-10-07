from repo_chores.constraints._engine import Workspace


def enforce_pytest_paths(workspace: Workspace) -> None:
    directories = [member.directory for member in workspace.members]
    directories = sorted(directories)

    test_directories = [
        test_directory
        for directory in directories
        if (test_directory := directory / "tests").exists()
    ]

    workspace.pytest.test_paths = test_directories
    workspace.pytest.python_paths = workspace.member_module_roots()
