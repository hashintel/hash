use super::Node;

/// A thunk expression in the HashQL High-Level Intermediate Representation.
///
/// Thunks are a fundamental component of HashQL's environment lifting transformation
/// strategy. They represent delayed computations that exist only at the top level
/// of modules and serve to eliminate environment capture from closures by lifting
/// captured variables into module-level thunks.
///
/// This makes modules stateless, meaning that a module can be imported without executing any code,
/// allowing for a direct reference of its exported values without execution.
///
/// # Environment Lifting Transformation
///
/// The core purpose of thunks is to transform environment-capturing closures into
/// thin function pointers. Consider this transformation:
///
/// **Before (with environment capture):**
/// ```hashql
/// let a = 2 in
/// let b = (x: Int) => a + x in  // closure captures 'a'
/// let c = b(2)
/// ```
///
/// **After (with thunk lifting):**
/// ```hashql
/// let a = thunk(() -> 2) in                    // constant lifted to thunk
/// let b = thunk(() -> (x: Int) -> a() + x) in  // closure also becomes thunk
/// let c = thunk(() -> b()(2))                  // double call: b() returns closure, (2) calls it
/// ```
///
/// This transformation ensures that:
/// - All top-level bindings become thunks (including closures).
/// - Top-level closures never capture environment variables directly.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Thunk<'heap> {
    /// The expression to be evaluated when this thunk is forced.
    pub body: Node<'heap>,
}
