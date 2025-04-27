use core::ops::Deref;

use pretty::RcDoc;

use crate::{
    intern::Interned,
    newtype,
    symbol::Symbol,
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgumentData {
    pub name: Symbol,
}

// The name is stored in the environment, to allow for `!Drop`
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument {
    pub id: GenericArgumentId,

    // The initial type constraint (if present)
    pub constraint: Option<TypeId>,
}

impl PrettyPrint for GenericArgument {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let name = &env.auxiliary.arguments[&self.id].name;

        let mut doc = RcDoc::text(name.as_str()).annotate(ORANGE);

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
pub struct GenericArguments<'heap>(Option<Interned<'heap, [GenericArgument]>>);

impl<'heap> GenericArguments<'heap> {
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `GenericArguments` from a slice of `GenericArgument`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_arguments` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [GenericArgument]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericArgument] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[] as &[GenericArgument],
        }
    }

    pub const fn len(&self) -> usize {
        match self.0 {
            Some(Interned(slice, _)) => slice.len(),
            None => 0,
        }
    }

    pub const fn is_empty(&self) -> bool {
        match self.0 {
            Some(Interned(slice, _)) => slice.is_empty(),
            None => true,
        }
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

impl AsRef<[GenericArgument]> for GenericArguments<'_> {
    fn as_ref(&self) -> &[GenericArgument] {
        self.as_slice()
    }
}

impl Deref for GenericArguments<'_> {
    type Target = [GenericArgument];

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
pub struct Param {
    pub argument: GenericArgumentId,
}

impl PrettyPrint for Param {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        _: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let name = &env.auxiliary.arguments[&self.argument].name;

        RcDoc::text(name.as_str())
    }
}
