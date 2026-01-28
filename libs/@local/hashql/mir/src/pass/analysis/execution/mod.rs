macro_rules! cost {
    ($value:expr) => {
        const { $crate::pass::analysis::execution::cost::Cost::new_panic($value) }
    };
}

mod cost;
mod statement_placement;
mod target;

pub use self::cost::{Cost, StatementCostVec};
