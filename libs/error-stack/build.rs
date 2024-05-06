#![allow(clippy::unwrap_used)]
use rustc_version::{version_meta, Channel, Version};

fn main() {
    let version_meta = version_meta().unwrap();

    println!("cargo:rustc-check-cfg=cfg(nightly)");
    if version_meta.channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly");
    }

    let rustc_version = version_meta.semver;
    let trimmed_rustc_version = Version::new(
        rustc_version.major,
        rustc_version.minor,
        rustc_version.patch,
    );

    println!("cargo:rustc-check-cfg=cfg(rust_1_65)");
    if trimmed_rustc_version >= Version::new(1, 65, 0) {
        println!("cargo:rustc-cfg=rust_1_65");
    }
}
