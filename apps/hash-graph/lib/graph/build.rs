use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=../../type-defs");
    println!("cargo:rerun-if-changed=src/api/gen");
    println!("cargo:rerun-if-changed=build.rs");

    let repo_root_path = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../../..")
        .canonicalize()
        .unwrap();

    std::process::Command::new("yarn")
        .args(["codegen", "--filter=hash-graph..."])
        .current_dir(repo_root_path)
        .spawn()
        .unwrap();
}
