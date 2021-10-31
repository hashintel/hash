extern crate cc;

fn main() {
    let v8 = std::env::var("V8_PATH").unwrap();

    println!("cargo:rerun-if-changed=src/worker/runner/javascript/mini_v8/ffi.cc");
    println!("cargo:rustc-link-search=native={}/out.gn/libv8/obj", v8);
    println!("cargo:rustc-link-lib=static=v8_monolith");
    cc::Build::new()
        .flag(&format!("-isystem{}/include", v8))
        .flag("-Wno-unused-result")
        .flag("-pthread")
        .flag(&format!("-L{}/out.gn/libv8/obj", v8))
        .flag("-lv8_monolith")
        .flag("-std=c++14")
        .flag("-DV8_COMPRESS_POINTERS")
        .file("src/worker/runner/javascript/mini_v8/ffi.cc")
        .cpp(true)
        .compile("libmini-v8-ffi.a");
}
