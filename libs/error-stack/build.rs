use rustc_version::{Channel, version_meta};

fn main() {
    let version_meta = version_meta().expect("Could not get Rust version");

    println!("cargo:rustc-check-cfg=cfg(nightly)");
    if version_meta.channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly");
    }

    // Currently not used, but helpful for future reference
    //
    // let rustc_version = version_meta.semver;
    // let trimmed_rustc_version = Version::new(
    //     rustc_version.major,
    //     rustc_version.minor,
    //     rustc_version.patch,
    // );
    //
    // println!("cargo:rustc-check-cfg=cfg(rust_1_81)");
    // if trimmed_rustc_version >= Version::new(1, 81, 0) {
    //     println!("cargo:rustc-cfg=rust_1_81");
    // }

    if cfg!(feature = "futures") && !cfg!(feature = "unstable") {
        println!("cargo:warning=The `futures` feature requires the `unstable` feature.");
    }
}
