extern crate cc;

fn main() {
    let v8 = std::env::var("V8_PATH")
        .expect("`V8_PATH` environment variable wasn't set, refer to README");
    println!("cargo:rerun-if-changed=src/worker/runner/javascript/mini_v8/ffi.cc");
    println!("cargo:rustc-link-search=native={}/out.gn/libv8/obj", v8);
    println!("cargo:rustc-link-lib=static=v8_monolith");

    if cfg!(not(feature = "build-nng")) {
        let nng_path =
            std::env::var("NNG_PATH").expect("`NNG_PATH` environment variable wasn't set,");
        println!("cargo:rustc-link-search={nng_path}/lib");
        println!("cargo:rustc-link-lib=dylib=nng");
    }

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
