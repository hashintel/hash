macro_rules! cost {
    ($value:expr) => {
        const { $crate::pass::analysis::execution::cost::Cost::new_panic($value) }
    };
}

mod cost;
pub mod statement_placement;
pub mod target;

pub use self::cost::{Cost, StatementCostVec, TraversalCostVec};
