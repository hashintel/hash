#![expect(clippy::min_ident_chars, clippy::missing_asserts_for_indexing)]
#![coverage(off)]

use crate::{
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::{
        TypeId,
        environment::{AnalysisEnvironment, Environment, LatticeEnvironment},
        lattice::Lattice as _,
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
fn assert_join(lattice: &mut LatticeEnvironment, lhs: TypeId, rhs: TypeId, expected: &[TypeId]) {
    let lhs = lattice.r#type(lhs);
    let rhs = lattice.r#type(rhs);

    let actual = lhs.join(rhs, lattice);
    assert_lattice(lattice.environment, &actual, expected);
}

#[track_caller]
fn assert_meet(env: &mut LatticeEnvironment, lhs: TypeId, rhs: TypeId, expected: &[TypeId]) {
    let lhs = env.r#type(lhs);
    let rhs = env.r#type(rhs);

    let actual = lhs.meet(rhs, env);
    assert_lattice(env.environment, &actual, expected);
}

#[track_caller]
fn assert_lattice(env: &Environment, lhs: &[TypeId], rhs: &[TypeId]) {
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
fn assert_equivalent(env: &Environment, lhs: TypeId, rhs: TypeId) {
    let mut analysis = AnalysisEnvironment::new(env);

    let lhs_repr = analysis
        .r#type(lhs)
        .kind
        .pretty_print(env, PrettyOptions::default());
    let rhs_repr = analysis
        .r#type(rhs)
        .kind
        .pretty_print(env, PrettyOptions::default());

    assert!(analysis.is_equivalent(lhs, rhs), "{lhs_repr} != {rhs_repr}");
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
