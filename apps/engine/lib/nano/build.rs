use std::{fs, path::Path};

fn main() {
    if let Ok(nng_path) = std::env::var("NNG_PATH") {
        let nng_lib_path = Path::new(&nng_path).join("lib");
        let nng_lib_path = fs::canonicalize(&nng_lib_path)
            .unwrap_or_else(|err| panic!("Could not canonicalize {nng_lib_path:?}: {err}"))
            .to_string_lossy()
            .to_string();
        println!("cargo:rustc-link-search={nng_lib_path}");
        println!("cargo:rustc-link-lib=dylib=nng");
    }
}
