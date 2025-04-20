use core::ops::Deref;

use pretty::RcDoc;

use crate::{
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
pub struct GenericArguments<'heap>(&'heap [GenericArgument]);

impl<'heap> GenericArguments<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(&[])
    }

    /// Create a new `GenericArguments` from a slice of `GenericArgument`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_arguments` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: &'heap [GenericArgument]) -> Self {
        Self(slice)
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericArgument] {
        self.0
    }

    #[must_use]
    pub fn merge(&self, other: &Self, env: &Environment<'heap>) -> Self {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        let mut vec = Vec::with_capacity(self.0.len() + other.0.len());

        vec.extend_from_slice(self.0);
        vec.extend_from_slice(other.0);

        env.intern_generic_arguments(&mut vec)
    }
}

impl AsRef<[GenericArgument]> for GenericArguments<'_> {
    fn as_ref(&self) -> &[GenericArgument] {
        self.0
    }
}

impl Deref for GenericArguments<'_> {
    type Target = [GenericArgument];

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl PrettyPrint for GenericArguments<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::nil()
        } else {
            RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        self.0.iter().map(|argument| argument.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">"))
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

// /// Unifies a type parameter on the left-hand side with a concrete type on the right-hand side.
// ///
// /// The variance context determines how the parameter and the concrete type are compared.
// pub(crate) fn unify_param_lhs(env: &mut UnificationEnvironment, lhs: &Type<Param>, rhs: TypeId) {
//     // First check if the generic argument is in scope
//     let Some(argument) = env.generic_argument(lhs.kind.argument) else {
//         let diagnostic = generic_argument_not_found(env.source, lhs, lhs.kind.argument);
//         env.record_diagnostic(diagnostic);

//         return;
//     };

//     // Use the current variance context for unification
//     // This allows parameters to respect the variance of their containing context
//     env.unify_type(argument, rhs);

//     // In a strictly variance-aware system, we do NOT modify the parameter type
//     // This preserves the identity of the parameter in the type graph
// }

// /// Unifies a concrete type on the left-hand side with a type parameter on the right-hand side.
// ///
// /// The variance context determines how the concrete type and parameter are compared.
// pub(crate) fn unify_param_rhs(env: &mut UnificationEnvironment, lhs: TypeId, rhs: &Type<Param>) {
//     // First check if the generic argument is in scope
//     let Some(argument) = env.generic_argument(rhs.kind.argument) else {
//         let diagnostic = generic_argument_not_found(env.source, rhs, rhs.kind.argument);
//         env.record_diagnostic(diagnostic);

//         return;
//     };

//     // Use the current variance context for unification
//     // This allows parameters to respect the variance of their containing context
//     env.unify_type(lhs, argument);

//     // In a strictly variance-aware system, we do NOT modify the parameter type
//     // This preserves the identity of the parameter in the type graph
// }

// /// Unifies two type parameters.
// ///
// /// The variance context determines how the parameters are compared.
// pub(crate) fn unify_param(env: &mut UnificationEnvironment, lhs: &Type<Param>, rhs: &Type<Param>)
// {     // First check if both generic arguments are in scope
//     let lhs_argument = env.generic_argument(lhs.kind.argument);

//     if lhs_argument.is_none() {
//         let diagnostic = generic_argument_not_found(env.source, lhs, lhs.kind.argument);

//         env.record_diagnostic(diagnostic);
//     }

//     let rhs_argument = env.generic_argument(rhs.kind.argument);

//     if rhs_argument.is_none() {
//         let diagnostic = generic_argument_not_found(env.source, rhs, rhs.kind.argument);

//         env.record_diagnostic(diagnostic);
//     }

//     let Some((lhs_argument, rhs_argument)) = Option::zip(lhs_argument, rhs_argument) else {
//         return;
//     };

//     // Use the current variance context for unification
//     // This allows parameters to respect the variance of their containing context
//     env.unify_type(lhs_argument, rhs_argument);

//     // In a strictly variance-aware system, we do NOT modify the parameter types
//     // This preserves the identity of the parameters in the type graph
// }
