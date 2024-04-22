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

#[derive(Debug, Copy, Clone)]
struct EvaluationContext<'a> {
    workspace: &'a Workspace<'a>,
}

#[derive(Debug)]
struct WorkspaceMember<'a> {
    package: &'a Package,

    dependencies: HashSet<PackageId>,
    dev_dependencies: HashSet<PackageId>,
    build_dependencies: HashSet<PackageId>,
}

impl<'a> WorkspaceMember<'a> {
    fn new(workspace: &Workspace<'a>, id: &PackageId) -> Self {
        // find the package in the metadata
        let package = workspace
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

            let Some(source_id) = workspace.lookup_path(source_path.as_std_path()).cloned() else {
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

        Self {
            package,

            dependencies,
            dev_dependencies,
            build_dependencies,
        }
    }

    fn is_blockprotocol(&self) -> bool {
        // if any of the path components are "@blockprotocol" then it is a blockprotocol package
        self.package
            .manifest_path
            .components()
            .any(|component| component.as_str() == "@blockprotocol")
    }

    fn is_local(dependencies: &str) -> bool {
        // the following prefixes are considered local dependencies
        // @blockprotocol, @rust, @local, @apps, @repo
        dependencies.starts_with("@blockprotocol/")
            || dependencies.starts_with("@rust/")
            || dependencies.starts_with("@local/")
            || dependencies.starts_with("@apps/")
            || dependencies.starts_with("@repo/")
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

    fn package_dependencies(
        &self,
        ctx: EvaluationContext,
        dependencies: &mut Option<BTreeMap<String, String>>,
    ) {
        let dependencies = dependencies.get_or_insert_with(BTreeMap::new);

        dependencies.retain(|name, _| !Self::is_local(name));

        dependencies.extend(self.extra_dependencies());

        let members = self.dependencies.iter().map(|id| {
            let member = ctx.workspace.member(id);

            member.dependency_declaration()
        });

        dependencies.extend(members);
    }

    fn package_dev_dependencies(
        &self,
        ctx: EvaluationContext,
        dependencies: &mut Option<BTreeMap<String, String>>,
    ) {
        let dependencies = dependencies.get_or_insert_with(BTreeMap::new);

        dependencies.retain(|name, _| !Self::is_local(name));

        dependencies.extend(self.extra_dev_dependencies());

        let members = self
            .dev_dependencies
            .iter()
            .chain(self.build_dependencies.iter())
            .map(|id| {
                let member = ctx.workspace.member(id);

                member.dependency_declaration()
            });

        dependencies.extend(members);
    }

    fn parse_extra_dependencies(dependencies: &[serde_json::Value]) -> BTreeMap<String, String> {
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

        let dependencies = dependencies
            .as_array()
            .expect("extra-dependencies should be an array");

        Self::parse_extra_dependencies(dependencies)
    }

    fn extra_dev_dependencies(&self) -> BTreeMap<String, String> {
        let Some(sync) = self.package.metadata.get("sync") else {
            return BTreeMap::new();
        };

        let Some(turborepo) = sync.get("turborepo") else {
            return BTreeMap::new();
        };

        let Some(dependencies) = turborepo.get("extra-dev-dependencies") else {
            return BTreeMap::new();
        };

        let dependencies = dependencies
            .as_array()
            .expect("extra-dev-dependencies should be an array");

        Self::parse_extra_dependencies(dependencies)
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
    // if it doesn't exist, create it
    fn sync(&self, ctx: EvaluationContext) -> Option<PathBuf> {
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
            return None;
        }

        // set the version of the package.json file to the version of the crate
        package_json.version = Some(self.package_version());

        // set the license of the package.json file to the license of the crate
        if let Some(license) = self.package.license.as_ref() {
            package_json
                .other_fields
                .insert("license".to_string(), license.to_owned().into());
        } else {
            package_json.other_fields.remove("license");
        }

        // set the package to private if the crate is private
        package_json
            .other_fields
            .insert("private".to_string(), self.is_private().into());

        // set the name of the package.json
        package_json.name = Some(self.package_name());

        // set the dependencies of the package.json file to the dependencies of the crate
        self.package_dependencies(ctx, &mut package_json.dependencies);
        self.package_dev_dependencies(ctx, &mut package_json.dev_dependencies);

        // write the package.json file back to disk
        let package_json = serde_json::to_string_pretty(&package_json)
            .expect("package.json should be serializable");
        fs::write(&path, package_json).expect("package.json should be writable");

        Some(path)
    }
}

// in theory we could make these all a lot more memory efficient through
// borrowing, but that isn't really necessary for this script
#[derive(Debug)]
struct Workspace<'a> {
    metadata: &'a Metadata,

    members: HashMap<PackageId, WorkspaceMember<'a>>,
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

        let mut this = Self {
            metadata,
            members: HashMap::new(),
            reverse_path,
        };

        for id in metadata.workspace_members.iter() {
            this.members
                .insert(id.clone(), WorkspaceMember::new(&this, id));
        }

        this
    }

    fn lookup_path(&self, path: &Path) -> Option<&PackageId> {
        self.reverse_path.get(path)
    }

    fn member(&self, id: &PackageId) -> &WorkspaceMember<'a> {
        self.members.get(id).expect("member should exist")
    }

    fn members(&self) -> impl Iterator<Item = &WorkspaceMember<'a>> {
        self.members.values()
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

    let ctx = EvaluationContext {
        workspace: &workspace,
    };

    for member in workspace.members() {
        eprintln!("Syncing {}...", member.package_name());
        let path = member.sync(ctx);
        if let Some(path) = path {
            println!("{}", path.display());
        }
    }
}
