use core::mem::variant_count;

/// Represents the conceptual space or "universe" an item belongs to.
///
/// In HashQL, items exist in distinct conceptual spaces known as "universes".
/// This categorization helps distinguish items like type definitions from
/// runtime values or functions, even if they might share the same name.
/// Items in one universe generally do not conflict with items in another.
///
/// As an analogy, Rust also utilizes multiple universes. For instance:
/// - **Type Universe:** Contains definitions like `struct`, `enum`, `trait`.
/// - **Value Universe:** Contains concrete values (`let x = 5;`) and functions (`fn foo() {}`).
/// - **Macro Universe:** Contains procedural and declarative macros (`println!`, `vec!`).
///
/// Similarly, HashQL uses `Universe` to differentiate between its conceptual spaces.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Universe {
    /// Represents items belonging to the type universe (e.g., type definitions).
    Type,
    /// Represents items belonging to the value universe (e.g., concrete values, functions).
    Value,
}

const LENGTH: usize = variant_count::<Universe>();

pub struct Segmented<T> {
    data: [T; LENGTH],
}
