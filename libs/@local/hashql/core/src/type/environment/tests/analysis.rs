use crate::{
    collections::FastHashMap,
    r#type::{
        TypeBuilder, TypeId,
        builder::lazy,
        inference::{Substitution, VariableKind, VariableLookup, solver::Unification},
        kind::{GenericArgument, generic::GenericSubstitution},
        tests::scaffold,
    },
};

struct SetupAlias {
    lookup: VariableLookup,

    lhs_kind: VariableKind,
    lhs_type: TypeId,

    rhs_kind: VariableKind,
    rhs_type: TypeId,

    root: VariableKind,
}

impl SetupAlias {
    fn setup(builder: &mut TypeBuilder) -> Self {
        let mut unification = Unification::new();

        let lhs = VariableKind::Hole(builder.fresh_hole());
        let rhs = VariableKind::Generic(builder.fresh_argument("T"));

        unification.unify(lhs, rhs);

        let lookup = unification.lookup();
        let root = lookup[lhs];

        let lhs_type = builder.partial(|_| lhs.into_type_kind());
        let rhs_type = builder.partial(|_| rhs.into_type_kind());

        Self {
            lookup,
            lhs_kind: lhs,
            lhs_type,
            rhs_kind: rhs,
            rhs_type,
            root,
        }
    }
}

#[test]
fn variable_representative_lookup() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_kind,
        rhs_kind,
        root,
        ..
    } = SetupAlias::setup(&mut builder);

    analysis.set_variables(lookup);

    assert_eq!(analysis.variable_representative(lhs_kind), root);
    assert_eq!(analysis.variable_representative(rhs_kind), root);
}

#[test]
fn variable_representative_substitution() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_kind,
        rhs_kind,
        root,
        ..
    } = SetupAlias::setup(&mut builder);

    analysis.set_substitution(Substitution::new(lookup, FastHashMap::default()));

    assert_eq!(analysis.variable_representative(lhs_kind), root);
    assert_eq!(analysis.variable_representative(rhs_kind), root);
}

#[test]
fn variable_representative_preference() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_kind,
        rhs_kind,
        root,
        ..
    } = SetupAlias::setup(&mut builder);

    analysis.set_variables(lookup);
    // Create an empty substitution map, which would panic on call (therefore fail) - if accessed
    analysis.set_substitution(Substitution::new(
        Unification::new().lookup(),
        FastHashMap::default(),
    ));

    assert_eq!(analysis.variable_representative(lhs_kind), root);
    assert_eq!(analysis.variable_representative(rhs_kind), root);
}

#[test]
fn is_alias_not_root() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_kind,
        lhs_type,
        rhs_kind,
        rhs_type,
        ..
    } = SetupAlias::setup(&mut builder);
    analysis.set_variables(lookup);

    assert!(analysis.is_alias(lhs_type, rhs_kind));
    assert!(analysis.is_alias(rhs_type, lhs_kind));
}

#[test]
fn is_alias() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_type,
        rhs_type,
        root,
        ..
    } = SetupAlias::setup(&mut builder);
    analysis.set_variables(lookup);

    assert!(analysis.is_alias(lhs_type, root));
    assert!(analysis.is_alias(rhs_type, root));
}

#[test]
fn is_alias_recursive() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_type,
        root,
        ..
    } = SetupAlias::setup(&mut builder);
    analysis.set_variables(lookup);

    // Create a union which references itself, which then has a type in itself
    let recursive = builder.union(lazy(|id, _| [builder.intersection([id.value()]), lhs_type]));

    assert!(!analysis.is_alias(recursive, root));
}

#[test]
fn is_alias_passthrough() {
    scaffold!(heap, env, builder, [analysis: analysis]);

    let SetupAlias {
        lookup,
        lhs_type,
        root,
        ..
    } = SetupAlias::setup(&mut builder);
    analysis.set_variables(lookup);

    let apply = builder.apply([] as [GenericSubstitution; 0], lhs_type);
    assert!(analysis.is_alias(apply, root));

    let generic = builder.generic([] as [GenericArgument<'static>; 0], lhs_type);
    assert!(analysis.is_alias(generic, root));
}
