use rustc_version::{version_meta, Channel, Version};

fn main() {
    let version_meta = version_meta().unwrap();

    if version_meta.channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly")
    }

    let rustc_version = version_meta.semver;
    let trimmed_rustc_version = Version::new(
        rustc_version.major,
        rustc_version.minor,
        rustc_version.patch,
    );

    if trimmed_rustc_version >= Version::new(1, 65, 0) {
        println!("cargo:rustc-cfg=rust_1_65");
    }

    #[cfg(feature = "futures")]
    println!(
        "cargo:warning=The `futures` feature for `error-stack` is deprecated as it's not required \
         anymore. It will be removed in error-stack v0.3."
    );

    #[cfg(feature = "hooks")]
    println!(
        "cargo:warning=The `hooks` feature for `error-stack` is deprecated as it's not required \
         anymore. It will be removed in error-stack v0.3."
    );
}
