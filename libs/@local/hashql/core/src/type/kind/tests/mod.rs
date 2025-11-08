#![expect(clippy::min_ident_chars, clippy::missing_asserts_for_indexing)]
#![coverage(off)]

use crate::{
    pretty::{self, Formatter, RenderOptions},
    r#type::{
        TypeId,
        environment::{AnalysisEnvironment, Environment, LatticeEnvironment, Variance},
        lattice::Lattice as _,
        pretty::TypeFormatter,
    },
};

mod closure;
mod generic;
mod generic_apply;
mod intersection;
mod intrinsic;
mod opaque;
mod primitive;
mod r#struct;
mod tuple;
mod union;

#[track_caller]
pub(crate) fn assert_join(
    lattice: &mut LatticeEnvironment,
    lhs: TypeId,
    rhs: TypeId,
    expected: &[TypeId],
) {
    let lhs = lattice.r#type(lhs);
    let rhs = lattice.r#type(rhs);

    let actual = lhs.join(rhs, lattice);
    assert_lattice(lattice.environment, &actual, expected);
}

#[track_caller]
pub(crate) fn assert_meet(
    env: &mut LatticeEnvironment,
    lhs: TypeId,
    rhs: TypeId,
    expected: &[TypeId],
) {
    let lhs = env.r#type(lhs);
    let rhs = env.r#type(rhs);

    let actual = lhs.meet(rhs, env);
    assert_lattice(env.environment, &actual, expected);
}

#[track_caller]
pub(crate) fn assert_lattice(env: &Environment, lhs: &[TypeId], rhs: &[TypeId]) {
    assert_eq!(
        lhs.len(),
        rhs.len(),
        "length of expected and actual types should match"
    );

    for (&lhs, &rhs) in lhs.iter().zip(rhs) {
        assert_equivalent(env, lhs, rhs);
    }
}

#[track_caller]
pub(crate) fn assert_equivalent(env: &Environment, lhs: TypeId, rhs: TypeId) {
    let formatter = Formatter::new();
    let mut formatter = TypeFormatter::with_defaults(&formatter, &env);

    let mut analysis = AnalysisEnvironment::new(env);

    let lhs_repr = formatter.format(lhs);
    let rhs_repr = formatter.format(rhs);

    assert!(
        analysis.is_equivalent(lhs, rhs),
        "{} != {}",
        pretty::render(&lhs, RenderOptions::default()),
        pretty::render(&rhs, RenderOptions::default())
    );
}

#[track_caller]
pub(crate) fn assert_is_subtype(env: &Environment, lhs: TypeId, rhs: TypeId) {
    let formatter = Formatter::new();
    let mut formatter = TypeFormatter::with_defaults(&formatter, &env);

    let mut analysis = AnalysisEnvironment::new(env);

    let lhs_repr = formatter.format(lhs);
    let rhs_repr = formatter.format(rhs);

    assert!(
        analysis.is_subtype_of(Variance::Covariant, lhs, rhs),
        "{} !< {}",
        pretty::render(lhs_repr, RenderOptions::default()),
        pretty::render(rhs_repr, RenderOptions::default())
    );
}

macro_rules! ty {
    (@impl $builder:expr; Number) => {
        $builder.number()
    };
    (@impl $builder:expr; Integer) => {
        $builder.integer()
    };
    (@impl $builder:expr; String) => {
        $builder.string()
    };
    (@impl $builder:expr; Null) => {
        $builder.null()
    };
    (@impl $builder:expr; Boolean) => {
        $builder.boolean()
    };
    (@impl $builder:expr; List < $($item:tt)* >) => {
        $builder.list(ty!(@impl $builder; $($item)*))
    };
    (@impl $builder:expr; Dict < $($key:tt)* , $($value:tt)* >) => {
        $builder.dict(ty!(@impl $builder; $($key)*), ty!(@impl $builder; $($value)*))
    };
    (@impl $builder:expr; ( $($name:ident: $type:tt,)* )) => {
        $builder.r#struct([$(($name, ty!(@impl $builder; $type))),*])
    };
    (@impl $builder:expr; ($($type:tt),*)) => {
        $builder.tuple([$(ty!(@impl $builder; $type)),*])
    };
    (@impl $builder:expr; ($($type:tt)|+)) => {
        $builder.union([$(ty!(@impl $builder; $type)),*])
    };
    (@impl $builder:expr; ($($type:tt)&*)) => {
        $builder.intersection([$(ty!(@impl $builder; $type)),*])
    };
    (@impl $builder:expr; fn($($param:tt),*) -> $return:tt) => {
        $builder.closure([$(ty!(@impl $builder; $param)),*], ty!(@impl $builder; $return))
    };

    ($($type:tt)*) => {
        |builder: &$crate::r#type::TypeBuilder| ty!(@impl builder; $($type)*)
    };
}
pub(crate) use ty;
