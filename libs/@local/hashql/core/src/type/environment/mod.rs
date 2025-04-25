pub mod analysis;
pub mod context;
pub mod infer;
pub mod lattice;
pub mod simplify;

pub use self::{
    analysis::AnalysisEnvironment,
    context::{
        auxiliary::AuxiliaryData, diagnostics::Diagnostics, substitution::Substitution,
        variance::Variance,
    },
    infer::InferenceEnvironment,
    lattice::LatticeEnvironment,
    simplify::SimplifyEnvironment,
};
use super::{
    Type, TypeId, TypeKind,
    intern::Interner,
    kind::{
        generic_argument::{GenericArgument, GenericArguments},
        r#struct::{StructField, StructFields},
    },
};
use crate::{arena::concurrent::ConcurrentArena, heap::Heap, span::SpanId};

#[derive(Debug)]
pub struct Environment<'heap> {
    pub source: SpanId,

    pub heap: &'heap Heap,
    pub types: ConcurrentArena<Type<'heap>>,
    interner: Interner<'heap>,

    pub auxiliary: AuxiliaryData,
    pub substitution: Substitution,
}

impl<'heap> Environment<'heap> {
    #[must_use]
    pub fn new(source: SpanId, heap: &'heap Heap) -> Self {
        Self {
            source,

            heap,
            types: ConcurrentArena::new(),
            interner: Interner::new(heap),

            auxiliary: AuxiliaryData::new(),
            substitution: Substitution::new(),
        }
    }

    #[must_use]
    pub fn new_empty(source: SpanId, heap: &'heap Heap) -> Self {
        Self {
            source,

            heap,
            types: ConcurrentArena::new(),
            interner: Interner::new_empty(heap),

            auxiliary: AuxiliaryData::new(),
            substitution: Substitution::new(),
        }
    }

    #[inline]
    pub fn alloc(&self, with: impl FnOnce(TypeId) -> Type<'heap>) -> TypeId {
        self.types.push_with(with)
    }

    #[inline]
    pub fn intern_kind(&self, kind: TypeKind<'heap>) -> &'heap TypeKind<'heap> {
        self.interner.intern_kind(kind)
    }

    #[inline]
    pub fn intern_type_ids(&self, ids: &[TypeId]) -> &'heap [TypeId] {
        self.interner.intern_type_ids(ids)
    }

    #[inline]
    pub fn intern_generic_arguments(
        &self,
        arguments: &mut [GenericArgument],
    ) -> GenericArguments<'heap> {
        self.interner.intern_generic_arguments(arguments)
    }

    /// Interns a slice of struct fields.
    ///
    /// # Errors
    ///
    /// Returns the original fields slice as an error if the interning process fails,
    /// such as when field names are not unique or other validation constraints are not met.
    #[inline]
    pub fn intern_struct_fields<'fields>(
        &self,
        fields: &'fields mut [StructField<'heap>],
    ) -> Result<StructFields<'heap>, &'fields mut [StructField<'heap>]> {
        self.interner.intern_struct_fields(fields)
    }
}
