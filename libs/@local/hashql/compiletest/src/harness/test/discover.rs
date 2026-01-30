use std::{
    collections::HashMap,
    ffi::OsStr,
    fs::{self, DirEntry},
    path::{Path, PathBuf},
    thread,
};

use camino::Utf8Path;
use guppy::graph::{PackageGraph, Workspace};
use walkdir::WalkDir;

use super::{EntryPoint, Spec, TestCase, TestGroup};

struct SpecTrie {
    entries: HashMap<PathBuf, Spec>,
}

impl SpecTrie {
    fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    fn insert(&mut self, path: PathBuf, spec: Spec) {
        self.entries.insert(path, spec);
    }

    fn get_ancestor_value(&self, path: &Path) -> Option<&Spec> {
        for ancestor in path.ancestors() {
            if let Some(spec) = self.entries.get(ancestor) {
                return Some(spec);
            }
        }

        None
    }
}

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
    let current_dir = current_rustc_dir();

    // Our search location is that of the 2nd parent
    let root_dir = current_dir
        .parent()
        .expect("should have parent directory `hashql`");

    assert_eq!(root_dir.file_name(), Some(OsStr::new("hashql")));

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

fn current_rustc_dir() -> &'static Path {
    option_env!("CARGO_RUSTC_CURRENT_DIR").map_or_else(
        || {
            let manifest_dir = Path::new(::std::env!("CARGO_MANIFEST_DIR"));

            manifest_dir
                .ancestors()
                .find(|path| path.join("Cargo.toml").exists())
                .expect("should have permission to read `hashql` directory")
        },
        |rustc_root| Path::new(rustc_root),
    )
}

fn find_test_cases(entry_point: &EntryPoint) -> Vec<TestCase> {
    let walk = WalkDir::new(&entry_point.path)
        .into_iter()
        .filter_map(Result::ok);

    let mut specs = SpecTrie::new();
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
