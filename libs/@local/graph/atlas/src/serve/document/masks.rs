use hashql_core::id::{Id, bit_vec::BitMatrix};

use crate::{
    identity::NodeRowId,
    serve::{
        membership::{OntologySelection, SelectionSlot},
        scene::Scene,
    },
};

/// Membership over delivered slots and requested-type slots.
pub(super) struct TypeMasks<I> {
    pub bits: BitMatrix<I, SelectionSlot>,
}

impl<I: Id> TypeMasks<I> {
    /// Builds the membership matrix for `rows` against `types`.
    ///
    /// The matrix holds one row per delivered row, in the order `rows` supplies them. A row with
    /// no position in `world`'s epoch keeps its own slot with every bit clear, and the rows after
    /// it keep their slot numbers.
    pub(super) fn new(
        Scene { world, epoch, .. }: Scene<'_>,
        rows: impl IntoIterator<Item = NodeRowId, IntoIter: ExactSizeIterator>,
        types: &OntologySelection,
    ) -> Self {
        let rows = rows.into_iter();
        let mut bits = BitMatrix::new(rows.len(), types.len());
        let memberships = types.resolve(&world.ontology);

        for (slot, row) in rows.enumerate() {
            let Some(position) = world.layout.index.reverse(epoch, row) else {
                continue;
            };
            let slot = I::from_usize(slot);
            for (selection, membership) in memberships.iter_enumerated() {
                if membership.contains(position) {
                    bits.insert(slot, selection);
                }
            }
        }

        Self { bits }
    }
}
