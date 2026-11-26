#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

#[cfg(test)]
mod tests {
    /// The coverage report of the unit test run fails for a crate that runs no test.
    #[test]
    fn placeholder() {}
}
