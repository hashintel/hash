macro_rules! cost {
    ($value:expr) => {
        const { $crate::pass::execution::cost::Cost::new_panic($value) }
    };
}

mod cost;
mod placement;
pub mod splitting;
pub mod statement_placement;
pub mod target;
pub mod terminator_placement;

pub use self::cost::{ApproxCost, Cost, StatementCostVec, TraversalCostVec};
