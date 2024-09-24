#![expect(clippy::unwrap_used)]
use rustc_version::{Channel, version_meta};

fn main() {
    let version_meta = version_meta().unwrap();

    println!("cargo:rustc-check-cfg=cfg(nightly)");
    if version_meta.channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly");
    }
}
