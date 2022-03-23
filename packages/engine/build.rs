use std::{fs::canonicalize, path::Path};

fn path(path: impl AsRef<Path>) -> String {
    let path = path.as_ref();
    canonicalize(path)
        .unwrap_or_else(|err| panic!("Could not canonicalize {path:?}: {err}"))
        .to_string_lossy()
        .to_string()
}

fn main() {
    if let Ok(host) = std::env::var("HOST") {
        // So far we only require (and allow) manual nng linking for ARM-based Macs
        if host == "aarch64-apple-darwin" {
            let nng_path = std::env::var("NNG_PATH")
                .map(path)
                .expect("`NNG_PATH` environment variable wasn't set, refer to README");
            let nng_lib = path(Path::new(&nng_path).join("lib"));
            println!("cargo:rustc-link-search={nng_lib}");
            println!("cargo:rustc-link-lib=dylib=nng");
        }
    }
}
