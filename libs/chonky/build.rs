fn main() {
    #[cfg(target_os = "macos")]
    link_macos();

    #[cfg(target_os = "linux")]
    link_linux();
}

#[cfg(target_os = "macos")]
fn link_macos() {
    // `pdfium` requires linking to the `CoreGraphics` and `libc++` frameworks on macOS
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    // `pdfium` also has the `libc++` feature, which can be used instead, but this makes it more
    // explicit that we need both.
    println!("cargo:rustc-link-lib=c++");
}

#[cfg(target_os = "linux")]
fn link_linux() {
    // `pdfium` also has a `libstdc++` feature, which can be used instead, but this makes it more
    // explicit that we need a different one depending on architecture.
    println!("cargo:rustc-link-lib=stdc++");
}