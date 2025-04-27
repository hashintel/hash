use core::ops::Deref;

use pretty::RcDoc;

use crate::{
    intern::Interned,
    newtype, newtype_producer,
    symbol::{InternedSymbol, Symbol},
    r#type::{
        TypeId,
        environment::Environment,
        pretty_print::{ORANGE, PrettyPrint},
        recursion::RecursionDepthBoundary,
    },
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct GenericArgumentIdProducer(GenericArgumentId));

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgumentData {
    pub name: Symbol,
}

// The name is stored in the environment, to allow for `!Drop`
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument<'heap> {
    pub id: GenericArgumentId,
    pub name: InternedSymbol<'heap>,

    // The initial type constraint (if present)
    pub constraint: Option<TypeId>,
}

impl PrettyPrint for GenericArgument<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let mut doc = RcDoc::text(self.name.as_str().to_owned()).annotate(ORANGE);

        if let Some(constraint) = self.constraint {
            doc = doc.append(
                RcDoc::text(":")
                    .append(RcDoc::line())
                    .append(limit.pretty(env, constraint)),
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

impl AsRef<[GenericArgument<'heap>]> for GenericArguments<'_> {
    fn as_ref(&self) -> &[GenericArgument] {
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
        match self.0 {
            Some(Interned([], _)) | None => RcDoc::nil(),
            Some(Interned(arguments, _)) => RcDoc::text("<")
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
pub struct Param<'heap> {
    pub name: InternedSymbol<'heap>,
    pub argument: GenericArgumentId,
}

impl PrettyPrint for Param<'_> {
    fn pretty<'env>(
        &self,
        _: &'env Environment,
        _: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text(self.name.as_str().to_owned())
    }
}
