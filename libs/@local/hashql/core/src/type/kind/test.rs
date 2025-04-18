macro_rules! primitive {
    ($env:expr, $primitive:expr) => {
        instantiate(&$env, TypeKind::Primitive($primitive))
    };

    ($env:expr, $name:ident, $primitive:expr) => {
        let $name = primitive!($env, $primitive);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.primitive().expect("should be a primitive"));
    };
}

macro_rules! tuple {
    ($env:expr, $arguments:expr, $fields:expr) => {{
        let fields = $env.intern_type_ids(&$fields);
        let arguments = $env.intern_generic_arguments(&$arguments);

        instantiate(
            &$env,
            TypeKind::Tuple(TupleType {
                fields,
                arguments: GenericArguments::from_slice(arguments),
            }),
        )
    }};

    ($env:expr, $name:ident, $fields:expr, $arguments:expr) => {
        let $name = tuple!($env, $fields, $arguments);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.tuple().expect("should be a tuple"));
    };
}

macro_rules! union {
    ($env:expr, $variants:expr) => {{
        let variants = $env.intern_type_ids(&$variants);

        instantiate(&$env, TypeKind::Union(UnionType { variants }))
    }};

    ($env:expr, $name:ident, $variants:expr) => {
        let $name = union!($env, $variants);
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.into_union().expect("should be a union"));
        let $name = $name.as_ref();
    };
}

macro_rules! assert_kind {
    ($env:expr, $actual:expr, $expected:expr) => {
        assert_eq!($actual.len(), $expected.len());

        for (actual, expected) in $actual.into_iter().zip($expected.iter()) {
            let actual = &$env.types[actual].copied();
            assert_eq!(*actual.kind, *expected);
        }
    };
}

macro_rules! assert_equiv {
    ($env:expr, $actual:expr, $expected:expr) => {
        let actual = $actual;
        let expected = $expected;

        assert_eq!(actual.len(), expected.len());

        let mut equiv_env = TypeAnalysisEnvironment::new(&$env);

        for (&actual, &expected) in actual.iter().zip(expected.iter()) {
            let actual_repr = &$env.types[actual].copied().pretty_print(&equiv_env, 80);
            let expected_repr = &$env.types[expected].copied().pretty_print(&equiv_env, 80);

            assert!(
                equiv_env.is_equivalent(actual, expected),
                "actual: {actual_repr}, expected: {expected_repr}",
            );
        }
    };
}

pub(crate) use assert_equiv;
pub(crate) use assert_kind;
pub(crate) use primitive;
pub(crate) use tuple;
pub(crate) use union;
