use std::{fs::canonicalize, path::Path};

fn path(path: impl AsRef<Path>) -> String {
    let path = path.as_ref();
    canonicalize(path)
        .unwrap_or_else(|err| panic!("Could not canonicalize {path:?}: {err}"))
        .to_string_lossy()
        .to_string()
}

fn main() {
    let v8 = std::env::var("V8_PATH")
        .map(path)
        .expect("`V8_PATH` environment variable wasn't set, refer to README");
    let v8_include = path(Path::new(&v8).join("include"));
    let v8_obj = path(Path::new(&v8).join("out.gn").join("libv8").join("obj"));

    println!("cargo:rerun-if-changed=src/worker/runner/javascript/mini_v8/ffi.cc");
    println!("cargo:rustc-link-search=native={v8_obj}",);
    println!("cargo:rustc-link-lib=static=v8_monolith");

    cc::Build::new()
        .flag(&format!("-isystem{v8_include}"))
        .flag("-Wno-unused-result")
        .flag("-pthread")
        .flag(&format!("-L{v8_obj}"))
        .flag("-lv8_monolith")
        .flag("-std=c++14")
        .flag("-DV8_COMPRESS_POINTERS")
        .file("src/worker/runner/javascript/mini_v8/ffi.cc")
        .cpp(true)
        .compile("libmini-v8-ffi.a");
}
