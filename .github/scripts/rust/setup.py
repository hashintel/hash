"""
Setup script for the Rust GitHub Actions.

The output of this will be used as arguments for the GitHub Actions matrix.

see: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
"""

import re
import json
import itertools
import os
import toml

from fnmatch import fnmatch
from pathlib import Path
from pygit2 import Repository, Commit

CWD = Path.cwd()

# All jobs for all crates will run if any of these paths change
ALWAYS_RUN_PATTERNS = [".github/**", ".config/**", ".cargo/**"]

# Toolchains used for the specified crates in addition to the toolchain which is defined in
# rust-toolchain.toml
TOOLCHAINS = {
    "libs/antsi": ["1.63"],
    "libs/deer": ["1.65"],
    "libs/error-stack": ["1.63", "1.65"]
}

# Try and publish these crates when their version is changed in Cargo.toml
PUBLISH_PATTERNS = [
    "libs/antsi**",
    "libs/deer**",
    "libs/error-stack**",
    "libs/sarif**",
]

# Build a coverage report for these crates
COVERAGE_EXCLUDE_PATTERNS = ["apps/engine**"]

# We only run a subset of configurations for PRs, the rest will only be tested prior merging
IS_PULL_REQUEST_EVENT = False


def generate_diffs():
    """
    Generates a diff between `HEAD^` and `HEAD`
    """

    repository = Repository(CWD)
    head = repository.head.peel(Commit)
    return repository.diff(head.parents[0], head, context_lines=0)


def find_local_crates():
    """
    Returns all available crates in the workspace.

    If a crate is in a sub-crate of another crate, only the super-crate will be returned because
    the sub-crates will be picked up by `cargo` automatically.
    :return: a list of crate paths
    """
    return [path.relative_to(CWD).parent for path in CWD.rglob("Cargo.toml")]


def find_toolchain(crate):
    """
    Returns the toolchain for the specified crate.

    The toolchain is determined by the `rust-toolchain.toml` file in the crate's directory or any parent directory
    :param crate: the path to the crate
    :return: the toolchain for the crate
    """
    directory = crate
    root = Path(directory.root)

    while directory != root:
        toolchain_file = directory / "rust-toolchain.toml"
        if toolchain_file.exists():
            toolchain = toml.load(toolchain_file).get("toolchain", {}).get("channel")
            if toolchain:
                return toolchain
        directory = directory.parent

    raise Exception("No rust-toolchain.toml with a `toolchain.channel` attribute found")



def filter_parent_crates(crates):
    checked_crates = []
    for crate in crates:
        if not any(path in crate.parents for path in crates):
            checked_crates.append(crate)
    return checked_crates


def filter_for_changed_crates(diffs, crates):
    """
    Returns a list of paths to crates which have changed files

    If a file was changed, which matches `ALWAYS_RUN_PATTERNS`, all crates will be returned
    :param diffs: a list `Diff`s returned from git
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    # Check if any changed file matches `ALWAYS_RUN_PATTERNS`
    if any(
        fnmatch(diff.delta.new_file.path, pattern)
        for diff in diffs
        for pattern in ALWAYS_RUN_PATTERNS
    ):
        return crates

    # Get the unique crate paths which have changed files
    return list(
        {
            crate
            for crate in crates
            for diff in diffs
            if fnmatch(diff.delta.new_file.path, f"{crate}/**")
        }
    )


def filter_crates_by_changed_version(diffs, crates):
    """
    Returns the crates whose version has changed
    :param diffs: a list of `Diff`s returned from git
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """

    def crate_version_changed(crate, diff):
        if crate / "Cargo.toml" != Path(diff.delta.new_file.path):
            return False

        for hunk in diff.hunks:
            for line in hunk.lines:
                for content in line.content.splitlines():
                    if re.fullmatch('version\\s*=\\s*".*"', content):
                        return True
        return False

    return [
        crate
        for diff in diffs
        for crate in crates
        if crate_version_changed(crate, diff)
    ]


def filter_for_publishable_crates(crates):
    """
    Returns the crates which are allowed to be published
    :param crates: a list of paths to crates
    :return: a list of crate paths which are allowed to be published
    """
    return [
        crate
        for crate in crates
        for pattern in PUBLISH_PATTERNS
        if fnmatch(crate, pattern)
    ]


def filter_for_coverage_crates(crates):
    """
    Returns the crates for which a coverage report will be created
    :param crates: a list of paths to crates
    :return: a list of crate paths which are allowed to be published
    """
    return [
        crate
        for crate in crates
        for pattern in COVERAGE_EXCLUDE_PATTERNS
        if not fnmatch(crate, pattern)
    ]


def output_matrix(name, github_output_file, crates, **kwargs):
    """
    Outputs the job matrix for the given crates
    :param name: The name where the list of crates will be stored to be read by GitHub Actions
    :param crates: a list of paths to crates
    """

    crate_names = {}
    for crate in crates:
        with open(
                crate / "Cargo.toml", "r", encoding="UTF-8"
        ) as cargo_toml:
            cargo_toml_obj = toml.loads(cargo_toml.read())
            if "package" in cargo_toml_obj and "name" in cargo_toml_obj["package"]:
                crate_names[crate] = cargo_toml_obj["package"]["name"]
            else:
                crate_names[crate] = str(crate.name.replace("_", "-"))

    available_toolchains = set()
    for crate in crates:
        available_toolchains.add(find_toolchain(crate))
        if not IS_PULL_REQUEST_EVENT:
            for pattern, additional_toolchains in TOOLCHAINS.items():
                for additional_toolchain in additional_toolchains:
                    available_toolchains.add(additional_toolchain)

    used_toolchain_combinations = []
    for crate in crates:
        toolchains = [find_toolchain(crate)]

        # We only run the default toolchain on coverage/lint/publish (rust-toolchain.toml)
        if name not in ("coverage", "lint", "publish"):
            for pattern, additional_toolchains in TOOLCHAINS.items():
                if fnmatch(crate, pattern):
                    toolchains += additional_toolchains
        used_toolchain_combinations.append(
            itertools.product([crate_names[crate]], toolchains, repeat=1)
        )

    available_toolchain_combinations = itertools.product(crate_names.values(), available_toolchains)
    excluded_toolchain_combinations = set(available_toolchain_combinations).difference(
        *used_toolchain_combinations
    )

    matrix = dict(
        name=[crate_names[crate] for crate in crates],
        toolchain=list(available_toolchains),
        **kwargs,
        exclude=[
            dict(name=elem[0], toolchain=elem[1])
            for elem in excluded_toolchain_combinations
        ],
        include=[
            dict(name=crate_names[crate], directory=str(crate))
            for crate in crates
        ],
    )

    if len(matrix["name"]) == 0:
        matrix = {}

    github_output_file.write(f"{name}={json.dumps(matrix)}\n")
    print(f"Job matrix for {name}: {json.dumps(matrix, indent=4)}")


def main():
    diffs = generate_diffs()
    available_crates = find_local_crates()
    changed_crates = filter_for_changed_crates(diffs, available_crates)
    changed_parent_crates = filter_parent_crates(changed_crates)
    coverage_crates = filter_for_coverage_crates(changed_parent_crates)

    github_output_file = open(os.environ["GITHUB_OUTPUT_FILE_PATH"], "w")

    output_matrix("lint", github_output_file, changed_parent_crates)
    if IS_PULL_REQUEST_EVENT:
        output_matrix("test", github_output_file, changed_parent_crates, profile=["dev"])
    else:
        output_matrix("test", github_output_file, changed_parent_crates, profile=["dev", "release"])
    output_matrix("coverage", github_output_file, coverage_crates)
    output_matrix(
        "publish",
        github_output_file,
        filter_crates_by_changed_version(
            diffs, filter_for_publishable_crates(changed_crates)
        ),
        profile=["release"],
    )

    github_output_file.close()


if __name__ == "__main__":
    main()
