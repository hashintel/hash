pub mod analysis;
pub mod context;
pub mod infer;
pub mod instantiate;
pub mod lattice;
pub mod simplify;
#[cfg(test)]
mod tests;

pub use self::{
    analysis::AnalysisEnvironment, context::variance::Variance, infer::InferenceEnvironment,
    lattice::LatticeEnvironment, simplify::SimplifyEnvironment,
};
use super::{
    PartialType, Type, TypeId, TypeKind,
    inference::Substitution,
    kind::{
        Infer, Param, PrimitiveType,
        generic::{
            GenericArgument, GenericArgumentId, GenericArgumentIdProducer,
            GenericArgumentReference, GenericArguments, GenericSubstitution, GenericSubstitutions,
        },
        infer::{HoleId, HoleIdProducer},
        r#struct::{StructField, StructFields},
    },
};
use crate::{
    heap::Heap,
    intern::{InternMap, InternSet, Interned},
};

#[derive(Debug, Default)]
pub struct Counter {
    pub generic_argument: GenericArgumentIdProducer,
    pub hole: HoleIdProducer,
}

#[derive(Debug)]
pub struct Environment<'heap> {
    pub heap: &'heap Heap,

    pub types: InternMap<'heap, Type<'heap>>,
    kinds: InternSet<'heap, TypeKind<'heap>>,
    type_ids: InternSet<'heap, [TypeId]>,
    generic_arguments: InternSet<'heap, [GenericArgument<'heap>]>,
    generic_argument_references: InternSet<'heap, [GenericArgumentReference<'heap>]>,
    generic_substitutions: InternSet<'heap, [GenericSubstitution]>,
    struct_fields: InternSet<'heap, [StructField<'heap>]>,

    pub counter: Counter,
    pub substitution: Substitution,
}

impl<'heap> Environment<'heap> {
    #[must_use]
    pub fn new(heap: &'heap Heap) -> Self {
        let this = Self::new_empty(heap);
        prefill_environment(&this);

        this
    }

    #[must_use]
    pub fn new_empty(heap: &'heap Heap) -> Self {
        Self {
            heap,

            types: InternMap::new(heap),
            kinds: InternSet::new(heap),
            type_ids: InternSet::new(heap),
            generic_arguments: InternSet::new(heap),
            generic_argument_references: InternSet::new(heap),
            generic_substitutions: InternSet::new(heap),
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
        if arguments.is_empty() {
            return GenericArguments::empty();
        }

        arguments.sort_unstable_by_key(GenericArgument::as_anonymous);
        // Unlike `intern_struct_fields`, where we error out on duplicates, we simply remove them
        // here, as any duplicate means they're the same argument and therefore not necessarily an
        // error.
        let (dedupe, _) = arguments.partition_dedup_by_key(|argument| argument.as_anonymous());

        // If there are any `None` constraints, when `Some` constraints with the same id are
        // present, remove them. This is relatively easy, as we know there's only ever a *single*
        // `None` value out there, which is immediately followed by a `Some` value of the same id.
        let mut write_index = 0;
        let mut index = 0;
        while index < dedupe.len() {
            // Check if it is none and if we can lookahead.
            if let [current, next] = dedupe[index..]
                && current.id == next.id
                && current.constraint.is_none()
                && next.constraint.is_some()
            {
                // If that is the case increment the pointer, and therefore skip the element
                index += 1;
            }

            if write_index != index {
                dedupe[write_index] = dedupe[index];
            }

            write_index += 1;
            index += 1;
        }

        GenericArguments::from_slice_unchecked(
            self.generic_arguments.intern_slice(&dedupe[..write_index]),
        )
    }

    #[inline]
    pub fn intern_generic_argument_references(
        &self,
        references: &[GenericArgumentReference<'heap>],
    ) -> Interned<'heap, [GenericArgumentReference<'heap>]> {
        self.generic_argument_references.intern_slice(references)
    }

    #[inline]
    pub fn intern_generic_substitutions(
        &self,
        substitutions: &mut [GenericSubstitution],
    ) -> GenericSubstitutions<'heap> {
        if substitutions.is_empty() {
            return GenericSubstitutions::empty();
        }

        substitutions.sort_unstable();
        // Unlike `intern_struct_fields`, where we error out on duplicates, we simply remove them
        // here, as any duplicate means they're the same argument and therefore not necessarily an
        // error.
        let (dedupe, _) = substitutions.partition_dedup();

        GenericSubstitutions::from_slice_unchecked(self.generic_substitutions.intern_slice(dedupe))
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
    ) -> Result<
        StructFields<'heap>,
        (
            &'fields mut [StructField<'heap>],
            &'fields mut [StructField<'heap>],
        ),
    > {
        if fields.is_empty() {
            return Ok(StructFields::empty());
        }

        fields.sort_unstable_by(|lhs, rhs| lhs.name.cmp(&rhs.name));

        let (dedup, duplicates) = fields.partition_dedup_by_key(|field| field.name);

        if !duplicates.is_empty() {
            return Err((dedup, duplicates));
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
