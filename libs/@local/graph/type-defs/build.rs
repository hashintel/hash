#![expect(clippy::print_stderr)]

use std::path::PathBuf;

const CODEGEN_PACKAGE_PATH: &str = "libs/@local/status/typescript";
const CODEGEN_SCRIPT_PATH: &str = "scripts/codegen.ts";
const TYPE_DEFS_PATH: &str = "./typescript";

fn main() {
    let out_dir = std::env::var("OUT_DIR").expect("Failed to find OUT_DIR environment variable");

    let crate_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR")
            .expect("Failed to find CARGO_MANIFEST_DIR environment variable"),
    );
    let root_dir = crate_dir
        .join("../../../..")
        .canonicalize()
        .expect("Failed to find virtual manifest directory");

    let codegen_package_path = root_dir
        .join(CODEGEN_PACKAGE_PATH)
        .canonicalize()
        .expect("Failed to find codegen package path");
    let codegen_script_path = codegen_package_path
        .join(CODEGEN_SCRIPT_PATH)
        .canonicalize()
        .expect("Failed to find codegen script path");

    let type_defs_path = crate_dir
        .join(TYPE_DEFS_PATH)
        .canonicalize()
        .expect("Failed to find HASH Graph type-defs path");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={}", codegen_package_path.display());
    println!("cargo:rerun-if-changed={}", type_defs_path.display());

    // Try to find yarn in common locations
    let yarn_paths = [
        "/Users/ghost/.local/share/mise/installs/yarn/4.9.4/bin/yarn",
        "/Users/ghost/.local/share/mise/installs/yarn/4.9.2/bin/yarn",
        "/usr/local/bin/yarn",
        "/opt/homebrew/bin/yarn",
        "yarn", // fallback to PATH
    ];

    let mut yarn_cmd = None;
    for yarn_path in &yarn_paths {
        if std::path::Path::new(yarn_path).exists() || *yarn_path == "yarn" {
            yarn_cmd = Some(yarn_path);
            break;
        }
    }

    let yarn_cmd = yarn_cmd.expect("Could not find yarn executable");

    if !std::process::Command::new(yarn_cmd)
        .args([
            "tsx",
            &codegen_script_path.to_string_lossy(),
            &type_defs_path.to_string_lossy(),
            "--rust-out-dir",
            &out_dir,
            // Uncomment this to generate JSON Schema definitions in the `OUT_DIR` as well
            // Be aware that when re-generating the JSON Schema definitions, you will need to do
            // some manual work, to make sure it's compliant with OpenAPI 3.0
            // This includes:
            //  * remove `$schema` and `$comment`,
            //  * rename `Record<string, any>` to `Object`,
            //  * move `definitions` to `status_definitions.json` (under the `definitions` key),
            //  * make sure all refs in `status.json` point to it
            // This is a chore (I know), but otherwise openapi-generator-cli will fail to generate
            // the client :/
            // "--json-schema-out-dir",
            // &out_dir,
        ])
        .current_dir(crate_dir)
        .env(
            "PATH",
            format!(
                "/Users/ghost/.local/share/mise/installs/node/22.17.1/bin:/Users/ghost/.local/\
                 share/mise/installs/yarn/4.9.4/bin:{}",
                std::env::var("PATH").unwrap_or_default()
            ),
        )
        .status()
        .expect("Failed to run codegen")
        .success()
    {
        panic!("Failed to run codegen");
    }
    eprintln!("Generated files in: {}", &out_dir);
}
