use alloc::alloc::Global;

use super::{Cost, StatementCostVec};
use crate::body::{basic_block::BasicBlockId, location::Location};

/// `Cost::new` succeeds for valid values (0 and 100).
#[test]
fn cost_new_valid_values() {
    let zero = Cost::new(0);
    assert!(zero.is_some());

    let hundred = Cost::new(100);
    assert!(hundred.is_some());
}

/// `Cost::new(u32::MAX)` returns `None` (reserved as niche for `Option<Cost>`).
#[test]
fn cost_new_max_returns_none() {
    let max = Cost::new(u32::MAX);
    assert!(max.is_none());
}

/// `Cost::new(u32::MAX - 1)` succeeds (largest valid cost value).
#[test]
fn cost_new_max_minus_one_valid() {
    let max_valid = Cost::new(u32::MAX - 1);
    assert!(max_valid.is_some());
}

/// `Cost::new_unchecked` with valid values works correctly.
///
/// This test exercises unsafe code and should be run under Miri.
#[test]
#[expect(unsafe_code)]
fn cost_new_unchecked_valid() {
    // SAFETY: 0 is not u32::MAX
    let zero = unsafe { Cost::new_unchecked(0) };
    assert_eq!(Cost::new(0), Some(zero));

    // SAFETY: 100 is not u32::MAX
    let hundred = unsafe { Cost::new_unchecked(100) };
    assert_eq!(Cost::new(100), Some(hundred));
}

/// `StatementCostVec` uses 1-based `Location` indexing to address the underlying
/// 0-based `BlockPartitionedVec`.
#[test]
fn statement_cost_vec_location_indexing() {
    let mut costs = StatementCostVec::from_iter([2, 3].into_iter(), Global);

    let loc_0_1 = Location {
        block: BasicBlockId::new(0),
        statement_index: 1,
    };
    let loc_0_2 = Location {
        block: BasicBlockId::new(0),
        statement_index: 2,
    };
    let loc_1_2 = Location {
        block: BasicBlockId::new(1),
        statement_index: 2,
    };

    costs[loc_0_1] = Some(cost!(10));
    costs[loc_0_2] = Some(cost!(20));
    costs[loc_1_2] = Some(cost!(30));

    assert_eq!(costs.get(loc_0_1), Some(cost!(10)));
    assert_eq!(costs.get(loc_0_2), Some(cost!(20)));
    assert_eq!(costs.get(loc_1_2), Some(cost!(30)));

    // Unassigned location returns None
    let loc_1_1 = Location {
        block: BasicBlockId::new(1),
        statement_index: 1,
    };
    assert_eq!(costs.get(loc_1_1), None);
}
