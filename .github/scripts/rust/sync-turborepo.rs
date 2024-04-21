#!/usr/bin/env -S cargo +nightly -Zscript
```cargo
cargo-features = ["edition2024"]

[package]
edition = "2024"

[dependencies]
serde = {version = "*", features = ["derive"]}
serde_json = {version = "*", features = ["preserve_order"]}
cargo_metadata = {version = "*"}
nodejs_package_json = { version = "*", features = ["serialize"] }
```
#![feature(gen_blocks)]

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
};

use cargo_metadata::{DependencyKind, Metadata, MetadataCommand, Package, PackageId};
use nodejs_package_json::PackageJson;

// take the metadata of the current package (indicated by the first argument)
fn collect_metadata(cwd: &Path) -> Metadata {
    let mut cmd = MetadataCommand::new();
    cmd.manifest_path(cwd.join("Cargo.toml"));
    cmd.exec()
        .expect("workspace root should be in current working directory")
}

#[derive(Debug)]
struct WorkspaceMember<'a> {
    workspace: &'a Workspace<'a>,
    package: &'a Package,

    dependencies: HashSet<PackageId>,
    dev_dependencies: HashSet<PackageId>,
    build_dependencies: HashSet<PackageId>,
}

impl<'a> WorkspaceMember<'a> {
    fn is_blockprotocol(&self) -> bool {
        // if any of the path components are "@blockprotocol" then it is a blockprotocol package
        self.package
            .manifest_path
            .components()
            .any(|component| component.as_str() == "@blockprotocol")
    }

    fn package_name(&self) -> String {
        if self.is_blockprotocol() {
            return format!("@blockprotocol/{}-rs", self.package.name);
        }

        format!("@rust/{}", self.package.name)
    }

    fn package_version(&self) -> String {
        let version = self.package.version.to_string();

        if self.is_private() {
            return format!("{version}-private");
        }

        version
    }

    fn dependency_declaration(&self) -> (String, String) {
        (self.package_name(), self.package_version())
    }

    fn package_dependencies(&self) -> BTreeMap<String, String> {
        let extra = self.extra_dependencies();

        let mut dependencies: BTreeMap<_, _> = self.dependencies
            .iter()
            .map(|id| {
                let member = self.workspace.member(id);

                member.dependency_declaration()
            })
            .collect();

        dependencies.extend(extra);

        dependencies
    }

    fn package_dev_dependencies(&self) -> BTreeMap<String, String> {
        self.dev_dependencies
            .iter()
            .chain(self.build_dependencies.iter())
            .map(|id| {
                let member = self.workspace.member(id);

                member.dependency_declaration()
            })
            .collect()
    }

    fn extra_dependencies(&self) -> BTreeMap<String, String> {
        let Some(sync) = self.package.metadata.get("sync") else {
            return BTreeMap::new();
        };

        let Some(turborepo) = sync.get("turborepo") else {
            return BTreeMap::new();
        };

        let Some(dependencies) = turborepo.get("extra-dependencies") else {
            return BTreeMap::new();
        };

        let Some(dependencies) = dependencies.as_array() else {
            eprintln!(
                "extra-dependencies of {} should be an array",
                self.package.name
            );
            return BTreeMap::new();
        };

        dependencies
            .iter()
            .map(|dependency| {
                let name = dependency
                    .get("name")
                    .expect("dependency should have a name");
                let version = dependency
                    .get("version")
                    .expect("dependency should have a version");

                (
                    name.as_str().expect("name should be a string").to_owned(),
                    version
                        .as_str()
                        .expect("version should be a string")
                        .to_owned(),
                )
            })
            .collect()
    }

    fn is_ignored(&self) -> bool {
        self.is_blockprotocol()
    }

    fn is_private(&self) -> bool {
        self.package
            .publish
            .as_ref()
            .map_or(false, |registries| registries.is_empty())
    }

    // first find the package.json file in the package
    // if none is found print a warning and return
    fn sync(&self) {
        let directory = self
            .package
            .manifest_path
            .parent()
            .expect("package should have a parent directory")
            .as_std_path();

        let path = directory.join("package.json");

        let mut package_json = if path.exists() {
            // read the package.json file
            // (in theory first reading to a string is unnecessary, but this is a script after all)
            let buffer = fs::read_to_string(&path).expect("package.json should be readable");
            serde_json::from_str(&buffer).expect("package.json should be valid JSON")
        } else {
            // time to generate a package.json file
            eprintln!(
                "package.json does not exist in {}, creating package.json",
                path.display()
            );

            PackageJson::default()
        };

        if self.is_ignored() {
            eprintln!("package.json in {} is ignored", path.display());
            return;
        }

        // set the version of the package.json file to the version of the package
        package_json.version = Some(self.package_version());

        // set the package to private if the package is private
        package_json
            .other_fields
            .insert("private".to_string(), self.is_private().into());

        // set the name of the package.json
        package_json.name = Some(self.package_name());

        // set the dependencies of the package.json file to the dependencies of the package
        package_json.dependencies = Some(self.package_dependencies());
        package_json.dev_dependencies = Some(self.package_dev_dependencies());

        // write the package.json file back to disk
        let package_json = serde_json::to_string_pretty(&package_json)
            .expect("package.json should be serializable");
        fs::write(&path, package_json).expect("package.json should be writable");
    }
}

// in theory we could make these all a lot more memory efficient through
// borrowing, but that isn't really necessary for this script
#[derive(Debug)]
struct Workspace<'a> {
    metadata: &'a Metadata,

    members: HashSet<PackageId>,
    reverse_path: HashMap<PathBuf, PackageId>,
}

impl<'a> Workspace<'a> {
    fn new(metadata: &'a Metadata) -> Self {
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

        Self {
            metadata,
            members,
            reverse_path,
        }
    }

    fn lookup_path(&self, path: &Path) -> Option<&PackageId> {
        self.reverse_path.get(path)
    }

    fn member(&self, id: &PackageId) -> WorkspaceMember {
        // find the package in the metadata
        let package = self
            .metadata
            .packages
            .iter()
            .find(|p| p.id == *id)
            .expect("workspace member should be contained in metadata");

        // find the dependencies of the package that are also workspace members
        let mut dependencies = HashSet::new();
        let mut dev_dependencies = HashSet::new();
        let mut build_dependencies = HashSet::new();

        for dependency in &package.dependencies {
            let Some(source_path) = dependency.path.as_ref() else {
                continue;
            };

            let Some(source_id) = self.lookup_path(source_path.as_std_path()).cloned() else {
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

        WorkspaceMember {
            workspace: self,
            package,

            dependencies,
            dev_dependencies,
            build_dependencies,
        }
    }

    gen fn members(&self) -> WorkspaceMember {
        for member in &self.members {
            yield self.member(member);
        }
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
        .expect("should be able to determine the current working directory");

    let metadata = collect_metadata(&cwd);

    let workspace = Workspace::new(&metadata);

    for member in workspace.members() {
        println!("Syncing {}...", member.package_name());
        member.sync();
    }
}
