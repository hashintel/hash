//! Control of traversal depth for HIR folding.
//!
//! This module defines strategies for how deeply a fold operation traverses the HIR tree. The key
//! distinction is whether to process nested nodes or only the immediate structure.
//!
//! These strategies allow transformation passes to be more efficient by only processing the parts
//! of the tree that are relevant to their task.
//!
//! # Use Cases
//!
//! - **Shallow traversal**: Use when your transformation only affects top-level structure and
//!   doesn't need to process nested expressions. This is more efficient when deep traversal isn't
//!   necessary.
//!
//! - **Deep traversal**: Use when your transformation needs to process all nodes in the tree,
//!   including deeply nested ones. This is necessary for transforms that might apply anywhere in
//!   the code.

/// Trait defining the traversal depth strategy for HIR folding.
///
/// This trait controls whether a folder should process only the immediate structure or traverse
/// into nested nodes as well.
///
/// # Use Cases
///
/// Choose the appropriate implementation based on your transformation needs:
/// - [`Shallow`]: For transformations that only affect top-level structure
/// - [`Deep`]: For transformations that need to process all nodes
pub trait NestedFilter {
    /// Whether to process deeply nested nodes.
    ///
    /// When `true`, the folder will recursively process all nodes in the tree.
    /// When `false`, the folder will only process the immediate structure.
    const DEEP: bool;
}

/// Filter that only processes the immediate structure.
///
/// # Use Case
///
/// Use this when you only need to transform top-level nodes without recursing into nested
/// structures. This is more efficient for passes that don't need to examine every node in the tree.
pub struct Shallow(());
impl NestedFilter for Shallow {
    const DEEP: bool = false;
}

/// Filter that recursively processes all nested nodes.
///
/// # Use Case
///
/// Use this when you need to transform the entire tree, including all nested structures. This is
/// necessary for transformations that could apply to any node at any level of nesting.
pub struct Deep(());
impl NestedFilter for Deep {
    const DEEP: bool = true;
}
