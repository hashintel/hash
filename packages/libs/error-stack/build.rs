use rustc_version::{version_meta, Channel};

fn main() {
    if version_meta().unwrap().channel == Channel::Nightly {
        println!("cargo:rustc-cfg=nightly")
    }

    #[cfg(feature = "hooks")]
    println!(
        "cargo:warning=The `hooks` feature for `error-stack` is deprecated as it's not required \
         anymore"
    )
}
