from fnmatch import fnmatch
from pathlib import Path
import re
import json

CWD = Path.cwd()

# All jobs for all crates will run if any of these paths change
ALWAYS_RUN_PATTERNS = ["**/rust-toolchain.toml", ".github/**"]

# Crates which will be tested in release mode
TEST_IN_RELEASE_CRATES = ["packages/engine"]

# Exclude the stable channel for these crates
DISABLE_STABLE_PATTERNS = ["packages/engine**"]

# Exclude these crates to run `rustdoc` at
# Note: This will run `rustdoc` for all crates except the virtual package in `packages/engine`
DISABLE_DOC_PATTERNS = ["packages/engine"]

# Try and publish these crates when their version is changed in Cargo.toml
PUBLISH_PATTERNS = ["packages/libs/error-stack"]


def generate_diffs():
    """
    Generates a diff between `HEAD^` and `HEAD`
    """
    from pygit2 import Repository, Commit

    repository = Repository(CWD)
    head = repository.head.peel(Commit)
    return repository.diff(head.parents[0], head, context_lines=0)


def find_local_crates():
    """
    Returns all available crates in the workspace
    :return: a list of crate paths
    """
    return [path.relative_to(CWD).parent for path in CWD.rglob("Cargo.toml")]


def filter_for_changed_crates(diffs, crates):
    """
    Returns a list of paths to crates which have changed files

    If a file was changed, which matches `ALWAYS_RUN_PATTERNS`, all crates will be returned
    :param diffs: a list `Diff`s returned from git
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    # Check if any changed file matches `ALWAYS_RUN_PATTERNS`
    if any([fnmatch(diff.delta.new_file.path, pattern) for diff in diffs for pattern in ALWAYS_RUN_PATTERNS]):
        return crates

    # Get the unique crate paths which have changed files
    return list(set([crate
                     for crate in crates
                     for diff in diffs
                     if fnmatch(diff.delta.new_file.path, f"{crate}/**")]))


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
                    if re.fullmatch("version\\s*=\\s*\".*\"", content):
                        return True
        return False

    return [crate for diff in diffs for crate in crates if crate_version_changed(crate, diff)]


def filter_for_nightly_only_crates(crates):
    """
    Returns the crates which only supports the nightly compiler
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    return [crate for crate in crates for pattern in DISABLE_STABLE_PATTERNS if fnmatch(crate, pattern)]


def filter_for_crates_to_document(crates):
    """
    Returns the crates which should be documented
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    return [crate for crate in crates for pattern in DISABLE_DOC_PATTERNS if not fnmatch(crate, pattern)]


def filter_for_crates_with_release_tests(crates):
    """
    Returns the crates which should run their test in release mode as well
    :param crates: a list of paths to crates
    :return: a list of crate paths
    """
    return [crate for crate in crates for pattern in TEST_IN_RELEASE_CRATES if fnmatch(crate, pattern)]


def filter_for_publishable_crates(crates):
    """
    Returns the crates which are allowed to be published
    :param crates: a list of paths to crates
    :return: a list of crate paths which are allowed to be published
    """
    return [crate for crate in crates for pattern in PUBLISH_PATTERNS if fnmatch(crate, pattern)]


def output_exclude(crates):
    """
    Prints a exclude statements for a GitHub Action matrix.

    Currently, this only excludes nightly-only crates from running on stable by default
    :param crates: a list of paths to crates
    """

    output = json.dumps([dict(toolchain="stable", directory=str(crate)) for crate in filter_for_nightly_only_crates(crates)])
    print(f"::set-output name=exclude::{output}")
    print(f"exclude = {output}")


def output(name, crates):
    """
    Prints crates in a GitHub understandable way defined by name
    :param name: The name where the list of crates will be stored to be read by GitHub Actions
    :param crates: a list of crate paths to be outputted
    """

    output = json.dumps([str(crate) for crate in crates])
    print(f"::set-output name={name}::{output}")
    print(f"{name} = {output}")


def main():
    diffs = generate_diffs()
    available_crates = find_local_crates()
    changed_crates = filter_for_changed_crates(diffs, available_crates)

    output("rustfmt", changed_crates)
    output("clippy", changed_crates)
    output("test", changed_crates)
    output("bench", filter_for_crates_with_release_tests(changed_crates))
    output("miri", changed_crates)
    output("doc", filter_for_crates_to_document(changed_crates))
    output("publish", filter_crates_by_changed_version(diffs, filter_for_publishable_crates(changed_crates)))
    output_exclude(changed_crates)


if __name__ == "__main__":
    main()
