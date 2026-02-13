use hashql_core::heap::BumpAllocator;

use super::CondenseContext;

fn calculate_order(context: &mut CondenseContext<'_, impl BumpAllocator>) {
    // determine the order of each placement, by doing a MRV. We always pick the block with the
    // smallest remaining domain, and break ties by highest constraint degree.
    // What do we consider as the constraint degree:
    // - We take the amount of edges that are incoming and outgoing, and only count the ones that
    //   are not yet placed or are outside.
    todo!()
}
