use core::ops::Deref;

use pretty::RcDoc;

use super::generic_argument::GenericArguments;
use crate::{
    symbol::InternedSymbol,
    r#type::{
        Type, TypeId,
        environment::{
            Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        },
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub key: InternedSymbol<'heap>,
    pub value: TypeId,
}

impl PrettyPrint for StructField<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text(self.key.as_str().to_owned())
            .append(RcDoc::text(":"))
            .append(RcDoc::line())
            .append(limit.pretty(env, self.value))
            .group()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructFields<'heap>(&'heap [StructField<'heap>]);

impl<'heap> StructFields<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(&[])
    }

    /// Create a new `StructFields` from a slice of `StructField`s.
    ///
    /// The caller must ensure that the slice is sorted by key and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_struct_fields` instead.
    pub const fn from_slice_unchecked(slice: &'heap [StructField<'heap>]) -> Self {
        Self(slice)
    }

    pub const fn as_slice(&self) -> &[StructField<'heap>] {
        self.0
    }
}

impl<'heap> AsRef<[StructField<'heap>]> for StructFields<'heap> {
    fn as_ref(&self) -> &[StructField<'heap>] {
        self.0
    }
}

impl<'heap> Deref for StructFields<'heap> {
    type Target = [StructField<'heap>];

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl PrettyPrint for StructFields<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::text(":")
        } else {
            RcDoc::intersperse(
                self.0.iter().map(|field| field.pretty(env, limit)),
                RcDoc::text(",").append(RcDoc::line()),
            )
            .nest(1)
            .group()
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub fields: StructFields<'heap>,
    pub arguments: GenericArguments<'heap>,
}

impl<'heap> Lattice<'heap> for StructType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        todo!()
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        todo!()
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        todo!()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        todo!()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        todo!()
    }
}

impl PrettyPrint for StructType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        self.arguments
            .pretty(env, limit)
            .append(
                RcDoc::text("(")
                    .append(self.fields.pretty(env, limit))
                    .append(RcDoc::text(")"))
                    .group(),
            )
            .group()
    }
}
