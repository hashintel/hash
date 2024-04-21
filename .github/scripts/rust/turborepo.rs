#!/usr/bin/env -S cargo +nightly -Zscript
```cargo
[dependencies]
serde = {version = "*", features = ["derive"]}
serde_json = {version = "*", features = ["preserve_order"]}
cargo_metadata = {version = "*"}
```

use std::{
    collections::{HashMap, HashSet},
    env,
    path::{Path, PathBuf},
};

use cargo_metadata::{DependencyKind, Metadata, MetadataCommand, PackageId, Source};

// take the metadata of the current package (indicated by the first argument)
fn collect_metadata(cwd: &Path) -> Metadata {
    let mut cmd = MetadataCommand::new();
    cmd.manifest_path(cwd.join("Cargo.toml"));
    cmd.exec()
        .expect("Workspace root is in current working directory")
}

// in theory we could make these all a lot more memory efficient through
// borrowing, but that isn't really necessary for this script
struct WorkspaceMembers {
    members: HashSet<PackageId>,
    reverse_path: HashMap<PathBuf, PackageId>,
}

impl WorkspaceMembers {
    fn new(metadata: &Metadata) -> Self {
        let members: HashSet<_> = metadata.workspace_members.iter().cloned().collect();

        let reverse_path = metadata
            .packages
            .iter()
            .filter(|package| members.contains(&package.id))
            .filter_map(|package| {
                package
                    .manifest_path
                    .parent()
                    .map(|path| (path.to_path_buf().into_std_path_buf(), package.id.clone()))
            })
            .collect();

        Self { members, reverse_path }
    }

    fn contains(&self, package: &PackageId) -> bool {
        self.members.contains(package)
    }

    fn lookup_path(&self, path: &Path) -> Option<&PackageId> {
        self.reverse_path.get(path)
    }

    fn iter(&self) -> impl Iterator<Item = &PackageId> {
        self.members.iter()
    }
}

#[derive(Debug)]
struct MemberDependencies {
    dependencies: HashSet<PackageId>,
    dev_dependencies: HashSet<PackageId>,
    build_dependencies: HashSet<PackageId>,
}

fn workspace_dependencies(
    metadata: &Metadata,
    members: &WorkspaceMembers,
    package: &PackageId,
) -> MemberDependencies {
    // find the package in the metadata
    let package = metadata
        .packages
        .iter()
        .find(|p| p.id == *package)
        .expect("workspace member is in metadata");

    // find the dependencies of the package that are also workspace members
    let mut dependencies = HashSet::new();
    let mut dev_dependencies = HashSet::new();
    let mut build_dependencies = HashSet::new();

    for dependency in &package.dependencies {
        let Some(source_path) = dependency.path.as_ref() else {
            continue;
        };

        let Some(source_id) = members.lookup_path(source_path.as_std_path()).cloned() else {
            continue;
        };

        match dependency.kind {
            DependencyKind::Normal => {
                dependencies.insert(source_id);
            }
            DependencyKind::Development => {
                dev_dependencies.insert(source_id);
            }
            DependencyKind::Build => {
                build_dependencies.insert(source_id);
            }
            _ => {}
        }
    }

    MemberDependencies {
        dependencies,
        dev_dependencies,
        build_dependencies,
    }
}

fn main() {
    let mut args = env::args();

    // the first argument is the script, so skip it
    let _ = args.next();

    let cwd = args
        .next()
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(env::current_dir)
        .expect("able to determine current working directory");


    let metadata = collect_metadata(&cwd);

    let members = WorkspaceMembers::new(&metadata);

    for member in members.iter() {
        let deps = workspace_dependencies(&metadata, &members, member);
        println!("{}: {:?}", member, deps);
    }
}
