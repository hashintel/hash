use rustc_version::{version_meta, Channel};

fn main() {
    let version_meta = version_meta().expect("cannot get rustc version");

    println!("cargo:rustc-check-cfg=cfg(nightly)");
    if version_meta.channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly");
    }
}
