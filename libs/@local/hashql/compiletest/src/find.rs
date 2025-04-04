use std::{fs, path::PathBuf, thread};

use radix_trie::Trie;
use snapbox::{dir::Walk, utils::current_dir};
use toml::Table;

use crate::{EntryPoint, Spec, TestCase, TestGroup};

fn find_entry_points() -> Vec<EntryPoint> {
    let current_dir = current_dir!();

    // Our search location is that of the 2nd parent
    let root_dir = current_dir
        .parent()
        .expect("should have parent directory `compiletest`")
        .parent()
        .expect("should have parent directory `hashql`");

    let mut entry_points = Vec::new();

    // Check all the sub-directories for the existence of `/tests/ui/`
    let read_dir = root_dir
        .read_dir()
        .expect("should have permission to read `hashql` directory")
        .filter_map(Result::ok);

    for entry in read_dir {
        let is_dir = entry.file_type().is_ok_and(|r#type| r#type.is_dir());

        if !is_dir {
            continue;
        }

        let entry_path = entry.path();

        let path = entry_path.join("tests/ui");
        if !path.exists() {
            continue;
        }

        // We have an entry-point, check if a `Cargo.toml` exists, to query the name of the package
        // we're about to test
        let manifest_path = entry.path().join("Cargo.toml");
        if !manifest_path.exists() {
            tracing::warn!(path = %entry_path.display(), "directory has a `tests/ui` directory, but no `Cargo.toml` file. Skipping...");
            continue;
        }

        let manifest_content =
            fs::read_to_string(&manifest_path).expect("should be able to read `Cargo.toml`");

        let manifest = manifest_content
            .parse::<Table>()
            .expect("`Cargo.toml` should contain valid TOML");

        let Some(package_name) = manifest
            .get("package")
            .and_then(|value| value.get("name"))
            .and_then(|value| value.as_str())
        else {
            tracing::warn!(path = %entry_path.display(), "unable to determine the package name of the crate. Skipping...");
            continue;
        };

        tracing::info!(path = %entry_path.display(), tests = %path.display(), "adding entry point");

        entry_points.push(EntryPoint {
            path,
            krate: package_name.to_owned(),
        });
    }

    entry_points
}

fn find_test_cases(entry_point: &EntryPoint) -> Vec<TestCase> {
    let walk = Walk::new(&entry_point.path).filter_map(Result::ok);

    let mut specs: Trie<PathBuf, Spec> = Trie::new();
    let mut candidates = Vec::new();

    for file_path in walk {
        let file_name = file_path.file_name().expect("file should have file name");
        let extension = file_path.extension();

        if file_name == ".spec.toml" {
            let contents =
                fs::read_to_string(file_name).expect("should be able to read `.spec.toml`");

            specs.insert(
                file_path
                    .parent()
                    .expect("should have parent")
                    .to_path_buf(),
                toml::from_str(&contents).expect("should be valid spec"),
            );

            continue;
        }

        if extension.is_some_and(|extension| extension == "jsonc") {
            candidates.push(file_path);
        }
    }

    let mut cases = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        let Some(spec) = specs.get_ancestor_value(&candidate) else {
            panic!(
                "{} does not have a `.spec.toml` file in any of it's parent test directories",
                candidate.display()
            )
        };

        cases.push(TestCase {
            spec: spec.clone(),
            path: candidate,
        });
    }

    cases
}

pub(crate) fn find_tests() -> Vec<TestGroup> {
    let entry_points = find_entry_points();

    thread::scope(|scope| {
        let mut handles = Vec::new();

        for entry_point in entry_points {
            handles.push(scope.spawn(|| {
                let cases = find_test_cases(&entry_point);

                TestGroup {
                    entry: entry_point,
                    cases,
                }
            }));
        }

        let mut groups = Vec::new();

        for handle in handles {
            groups.push(handle.join().expect("should be able to join thread"));
        }

        groups
    })
}
