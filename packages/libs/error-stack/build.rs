use rustc_version::{version_meta, Channel, Version};

fn main() {
    if version_meta().unwrap().channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly")
    }

    let mut version = version_meta().unwrap().semver;
    // remove the suffix (like nightly)
    version.pre = vec![];
    version.build = vec![];

    if version >= Version::new(1, 65, 0) {
        println!("cargo:rustc-cfg=rust_1_65")
    }
}
