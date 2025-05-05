pub mod apply;

use core::ops::Deref;

use pretty::RcDoc;

pub use self::apply::{Apply, GenericSubstitution, GenericSubstitutions};
use crate::{
    intern::Interned,
    newtype, newtype_producer,
    symbol::Symbol,
    r#type::{
        TypeId,
        environment::Environment,
        pretty_print::{ORANGE, PrettyPrint, RED},
        recursion::RecursionDepthBoundary,
    },
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct GenericArgumentIdProducer(GenericArgumentId));

// The name is stored in the environment, to allow for `!Drop`
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument<'heap> {
    pub id: GenericArgumentId,
    pub name: Symbol<'heap>,

    // The initial type constraint (if present)
    pub constraint: Option<TypeId>,
}

impl PrettyPrint for GenericArgument<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let name = format!("{}?{}", self.name, self.id);

        let mut doc = RcDoc::text(name).annotate(ORANGE);

        if let Some(constraint) = self.constraint {
            doc = doc.append(
                RcDoc::text(":")
                    .append(RcDoc::line())
                    .append(limit.pretty(env, constraint))
                    .group(),
            );
        }

        doc
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArguments<'heap>(Option<Interned<'heap, [GenericArgument<'heap>]>>);

impl<'heap> GenericArguments<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `GenericArguments` from a slice of `GenericArgument`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_arguments` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [GenericArgument<'heap>]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericArgument<'heap>] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[] as &[GenericArgument<'heap>],
        }
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.as_slice().len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.as_slice().is_empty()
    }

    #[must_use]
    pub fn merge(&self, other: &Self, env: &Environment<'heap>) -> Self {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        let mut vec = Vec::with_capacity(self.len() + other.len());

        vec.extend_from_slice(self.as_slice());
        vec.extend_from_slice(other.as_slice());

        env.intern_generic_arguments(&mut vec)
    }
}

impl<'heap> AsRef<[GenericArgument<'heap>]> for GenericArguments<'heap> {
    fn as_ref(&self) -> &[GenericArgument<'heap>] {
        self.as_slice()
    }
}

impl<'heap> Deref for GenericArguments<'heap> {
    type Target = [GenericArgument<'heap>];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl PrettyPrint for GenericArguments<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self.as_slice() {
            [] => RcDoc::nil(),
            arguments => RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        arguments.iter().map(|argument| argument.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">")),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}

impl PrettyPrint for Param {
    fn pretty<'env>(
        &self,
        _: &'env Environment,
        _: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text(format!("?{}", self.argument))
    }
}
