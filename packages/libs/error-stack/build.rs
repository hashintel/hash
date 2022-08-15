use rustc_version::{version_meta, Channel, Version};

fn main() {
    if version_meta().unwrap().channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly")
    }

    let mut version = version_meta().unwrap().semver;
    // remove the suffix (like nightly)
    version.pre = vec![];
    version.build = vec![];

    if let Some(build_date) = version_meta().unwrap().commit_date {
        let mut build_date = build_date.split('-');
        let year: usize = build_date.next().unwrap().parse().unwrap();
        let month: usize = build_date.next().unwrap().parse().unwrap();
        let day: usize = build_date.next().unwrap().parse().unwrap();

        if year >= 2022 && month >= 8 && day >= 10 {
            println!("cargo:rustc-cfg=nightly_2022_08_10")
        }
    }

    if version >= Version::new(1, 65, 0) {
        println!("cargo:rustc-cfg=rust_1_65")
    }
}
