//! Layered configuration for HASH binaries
//!
//! # Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

#[cfg(test)]
mod tests {
    #[test]
    fn crate_uses_expected_package_name() {
        assert_eq!(env!("CARGO_PKG_NAME"), "hash-config");
    }
}
