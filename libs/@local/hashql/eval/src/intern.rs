use hashql_core::{intern::InternSet, symbol::Symbol};

/// Interner for the evaluation stage.
///
/// Must be created from the MIR interner via [`From`] to preserve
/// [`Interned`](hashql_core::intern::Interned) pointer identity across
/// the MIR/eval boundary.
#[derive(Debug)]
pub struct Interner<'heap> {
    pub symbols: InternSet<'heap, [Symbol<'heap>]>,
}

#[cfg(test)]
impl<'heap> Interner<'heap> {
    pub(crate) fn testing(heap: &'heap hashql_core::heap::Heap) -> Self {
        Self {
            symbols: InternSet::new(heap),
        }
    }
}

impl<'heap> From<hashql_mir::intern::Interner<'heap>> for Interner<'heap> {
    fn from(interner: hashql_mir::intern::Interner<'heap>) -> Self {
        Self {
            symbols: interner.symbols,
        }
    }
}
