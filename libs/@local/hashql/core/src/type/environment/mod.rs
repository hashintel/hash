pub mod analysis;
pub mod context;
pub mod infer;
pub mod instantiate;
pub mod lattice;
pub mod simplify;

pub use self::{
    analysis::AnalysisEnvironment,
    context::{diagnostics::Diagnostics, variance::Variance},
    infer::InferenceEnvironment,
    lattice::LatticeEnvironment,
    simplify::SimplifyEnvironment,
};
use super::{
    PartialType, Type, TypeId, TypeKind,
    inference::Substitution,
    kind::{
        Infer, Param, PrimitiveType,
        generic_argument::{
            GenericArgument, GenericArgumentId, GenericArgumentIdProducer, GenericArguments,
        },
        infer::{HoleId, HoleIdProducer},
        r#struct::{StructField, StructFields},
    },
};
use crate::{
    heap::Heap,
    intern::{InternMap, InternSet, Interned},
    span::SpanId,
};

#[derive(Debug, Default)]
pub struct Counter {
    pub generic_argument: GenericArgumentIdProducer,
    pub hole: HoleIdProducer,
}

#[derive(Debug)]
pub struct Environment<'heap> {
    pub source: SpanId,

    pub heap: &'heap Heap,

    pub types: InternMap<'heap, Type<'heap>>,
    kinds: InternSet<'heap, TypeKind<'heap>>,
    type_ids: InternSet<'heap, [TypeId]>,
    generic_arguments: InternSet<'heap, [GenericArgument<'heap>]>,
    struct_fields: InternSet<'heap, [StructField<'heap>]>,

    pub counter: Counter,
    pub substitution: Substitution,
}

impl<'heap> Environment<'heap> {
    #[must_use]
    pub fn new(source: SpanId, heap: &'heap Heap) -> Self {
        let this = Self::new_empty(source, heap);
        prefill_environment(&this);

        this
    }

    #[must_use]
    pub fn new_empty(source: SpanId, heap: &'heap Heap) -> Self {
        Self {
            source,

            heap,

            types: InternMap::new(heap),
            kinds: InternSet::new(heap),
            type_ids: InternSet::new(heap),
            generic_arguments: InternSet::new(heap),
            struct_fields: InternSet::new(heap),

            counter: Counter::default(),
            substitution: Substitution::default(),
        }
    }

    #[inline]
    pub fn r#type(&self, id: TypeId) -> Type<'heap> {
        self.types.index(id)
    }

    #[inline]
    pub fn intern_type(&self, partial: PartialType<'heap>) -> TypeId {
        self.types.intern_partial(partial).id
    }

    #[inline]
    pub fn intern_kind(&self, kind: TypeKind<'heap>) -> Interned<'heap, TypeKind<'heap>> {
        self.kinds.intern(kind)
    }

    #[inline]
    pub fn intern_type_ids(&self, ids: &[TypeId]) -> Interned<'heap, [TypeId]> {
        self.type_ids.intern_slice(ids)
    }

    #[inline]
    pub fn intern_generic_arguments(
        &self,
        arguments: &mut [GenericArgument<'heap>],
    ) -> GenericArguments<'heap> {
        arguments.sort_unstable_by(|lhs, rhs| lhs.id.cmp(&rhs.id));
        // Unlike `intern_struct_fields`, where we error out on duplicates, we simply remove them
        // here, as any duplicate means they're the same argument and therefore not necessarily an
        // error.
        let (dedupe, _) = arguments.partition_dedup_by_key(|argument| argument.id);

        GenericArguments::from_slice_unchecked(self.generic_arguments.intern_slice(dedupe))
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
        fields.sort_unstable_by(|lhs, rhs| lhs.name.cmp(&rhs.name));

        let (dedup, duplicates) = fields.partition_dedup_by_key(|field| field.name);

        if !duplicates.is_empty() {
            return Err(duplicates);
        }

        Ok(StructFields::from_slice_unchecked(
            self.struct_fields.intern_slice(dedup),
        ))
    }
}

fn prefill_environment(env: &Environment) {
    env.kinds.intern(TypeKind::Never);
    env.kinds.intern(TypeKind::Unknown);

    env.kinds.intern(TypeKind::Primitive(PrimitiveType::Number));
    env.kinds
        .intern(TypeKind::Primitive(PrimitiveType::Integer));
    env.kinds.intern(TypeKind::Primitive(PrimitiveType::String));
    env.kinds
        .intern(TypeKind::Primitive(PrimitiveType::Boolean));
    env.kinds.intern(TypeKind::Primitive(PrimitiveType::Null));

    // Intern the first 256 infer and params, we're unlikely to need more than this
    for index in 0..=u8::MAX {
        env.kinds.intern(TypeKind::Infer(Infer {
            hole: HoleId::new(u32::from(index)),
        }));
        env.kinds.intern(TypeKind::Param(Param {
            argument: GenericArgumentId::new(u32::from(index)),
        }));
    }
}
