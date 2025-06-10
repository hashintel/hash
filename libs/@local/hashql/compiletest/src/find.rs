use std::{
    fs::{self, DirEntry},
    path::{Path, PathBuf},
    thread,
};

use camino::Utf8Path;
use guppy::graph::{PackageGraph, Workspace};
use radix_trie::Trie;
use walkdir::WalkDir;

use crate::{EntryPoint, Spec, TestCase, TestGroup};

// vendored in from `snapbox`
macro current_dir() {{
    let root = cargo_rustc_current_dir!();
    let file = file!();
    let rel_path = Path::new(file).parent().unwrap();

    root.join(rel_path)
}}

macro cargo_rustc_current_dir() {{
    if let Some(rustc_root) = option_env!("CARGO_RUSTC_CURRENT_DIR") {
        Path::new(rustc_root)
    } else {
        let manifest_dir = Path::new(::std::env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .ancestors()
            .filter(|it| it.join("Cargo.toml").exists())
            .last()
            .unwrap()
    }
}}

fn find_entry_point<'graph>(
    output: &mut Vec<EntryPoint<'graph>>,
    workspace: &Workspace<'graph>,
    entry: &DirEntry,
) {
    let is_dir = entry.file_type().is_ok_and(|r#type| r#type.is_dir());

    if !is_dir {
        return;
    }

    let entry_path = entry.path();

    let path = entry_path.join("tests/ui");
    if !path.exists() {
        return;
    }

    let root = workspace.root();
    let relative_path = Utf8Path::from_path(&entry_path)
        .expect("should be a valid path")
        .strip_prefix(root)
        .expect("path should be relative to workspace root");

    // We have an entry-point, check if a `Cargo.toml` exists, to query the name of the package
    // we're about to test
    let metadata = match workspace.member_by_path(relative_path) {
        Ok(metadata) => metadata,
        Err(error) => {
            tracing::error!(path = %entry_path.display(), ?error, "failed to get metadata");
            return;
        }
    };

    tracing::info!(path = %entry_path.display(), tests = %path.display(), "adding entry point");

    output.push(EntryPoint { path, metadata });
}

fn find_entry_points(graph: &PackageGraph) -> Vec<EntryPoint<'_>> {
    let workspace = graph.workspace();
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
        find_entry_point(&mut entry_points, &workspace, &entry);
    }

    entry_points
}

fn find_test_cases(entry_point: &EntryPoint) -> Vec<TestCase> {
    let walk = WalkDir::new(&entry_point.path)
        .into_iter()
        .filter_map(Result::ok);

    let mut specs: Trie<PathBuf, Spec> = Trie::new();
    let mut candidates = Vec::new();

    for entry in walk {
        if entry.file_type().is_dir() {
            continue;
        }

        let file_path = entry.path().to_path_buf();

        let file_name = file_path.file_name().expect("file should have file name");
        let extension = file_path.extension();

        if file_name == ".spec.toml" {
            let contents =
                fs::read_to_string(&file_path).expect("should be able to read `.spec.toml`");

            specs.insert(
                file_path
                    .parent()
                    .expect("should have parent")
                    .to_path_buf(),
                toml::from_str(&contents).expect("should be valid spec"),
            );

            continue;
        }

        let parent = file_path.parent().expect("should have parent");
        let relative = parent
            .strip_prefix(&entry_point.path)
            .expect("file path should be child of entry point");

        let namespace: Vec<_> = relative
            .components()
            .filter_map(|component| component.as_os_str().to_str().map(ToOwned::to_owned))
            .collect();

        if extension.is_some_and(|extension| extension == "jsonc") {
            candidates.push((file_path, namespace));
        }
    }

    let mut cases = Vec::with_capacity(candidates.len());

    for (candidate, namespace) in candidates {
        let Some(spec) = specs.get_ancestor_value(&candidate) else {
            panic!(
                "{} does not have a `.spec.toml` file in any of it's parent test directories",
                candidate.display()
            )
        };

        cases.push(TestCase {
            spec: spec.clone(),
            path: candidate,
            namespace,
        });
    }

    cases
}

pub(crate) fn find_tests(graph: &PackageGraph) -> Vec<TestGroup<'_>> {
    let entry_points = find_entry_points(graph);

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
