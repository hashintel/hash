#![allow(clippy::print_stderr)]

use std::path::PathBuf;

const CODEGEN_PACKAGE_PATH: &str = "../../libs/@local/status";
const CODEGEN_SCRIPT_PATH: &str = "scripts/codegen.ts";
const TYPE_DEFS_PATH: &str = "./type-defs";

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={CODEGEN_PACKAGE_PATH}");
    println!("cargo:rerun-if-changed={TYPE_DEFS_PATH}");

    let out_dir = std::env::var("OUT_DIR").expect("Failed to find OUT_DIR environment variable");

    let virtual_manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR")
            .expect("Failed to find CARGO_MANIFEST_DIR environment variable"),
    )
    .join("../..")
    .canonicalize()
    .expect("Failed to find virtual manifest directory");

    let codegen_path = virtual_manifest_dir
        .join(CODEGEN_PACKAGE_PATH)
        .join(CODEGEN_SCRIPT_PATH)
        .canonicalize()
        .expect("Failed to find codegen script path");

    let type_defs_path = virtual_manifest_dir
        .join(TYPE_DEFS_PATH)
        .canonicalize()
        .expect("Failed to find HASH Graph type-defs path");

    if !std::process::Command::new("yarn")
        .args([
            "exe",
            &codegen_path.to_string_lossy(),
            &type_defs_path.to_string_lossy(),
            "--rust-out-dir",
            &out_dir,
            // Uncomment this to generate JSON Schema definitions in the `OUT_DIR` as well
            // "--json-schema-out-dir",
            // &out_dir,
        ])
        .current_dir(virtual_manifest_dir)
        .status()
        .expect("Failed to run codegen")
        .success()
    {
        panic!("Failed to run codegen");
    }
    eprintln!("Generated files in: {}", &out_dir);
}
