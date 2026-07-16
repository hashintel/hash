use std::{env, ffi::OsStr, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=RUSTC");
    println!("cargo:rerun-if-env-changed=CARGO_ENCODED_RUSTFLAGS");

    let rustc = env::var_os("RUSTC").unwrap_or_else(|| OsStr::new("rustc").to_owned());
    let output = Command::new(rustc)
        .arg("-vV")
        .output()
        .expect("hash-graph-atlas requires an invocable rustc");
    assert!(
        output.status.success(),
        "hash-graph-atlas could not inspect the configured rustc"
    );
    let verbose = String::from_utf8(output.stdout).expect("rustc -vV output should be valid UTF-8");

    export("HASH_GRAPH_ATLAS_RUSTC_RELEASE", field(&verbose, "release"));
    export(
        "HASH_GRAPH_ATLAS_RUSTC_COMMIT",
        field(&verbose, "commit-hash"),
    );
    export("HASH_GRAPH_ATLAS_RUSTC_HOST", field(&verbose, "host"));
    export_env("HASH_GRAPH_ATLAS_TARGET", "TARGET");
    export_env(
        "HASH_GRAPH_ATLAS_TARGET_FEATURES",
        "CARGO_CFG_TARGET_FEATURE",
    );
    export_env("HASH_GRAPH_ATLAS_PROFILE", "PROFILE");
    export_env("HASH_GRAPH_ATLAS_OPT_LEVEL", "OPT_LEVEL");
    export_env("HASH_GRAPH_ATLAS_DEBUG", "DEBUG");

    let encoded_rustflags = env::var_os("CARGO_ENCODED_RUSTFLAGS").unwrap_or_default();
    export(
        "HASH_GRAPH_ATLAS_RUSTFLAGS_HEX",
        &hex(encoded_rustflags.as_encoded_bytes()),
    );
}

fn field<'output>(output: &'output str, name: &str) -> &'output str {
    output
        .lines()
        .find_map(|line| line.strip_prefix(name)?.strip_prefix(": "))
        .unwrap_or("unknown")
}

fn export_env(name: &str, source: &str) {
    let value = env::var(source).unwrap_or_default();
    export(name, &value);
}

fn export(name: &str, value: &str) {
    println!("cargo:rustc-env={name}={value}");
}

fn hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        encoded.push(hex_digit(byte >> 4));
        encoded.push(hex_digit(byte & 0x0F));
    }
    encoded
}

fn hex_digit(nibble: u8) -> char {
    match nibble {
        0..=9 => char::from(b'0' + nibble),
        10..=15 => char::from(b'a' + nibble - 10),
        _ => '?',
    }
}
