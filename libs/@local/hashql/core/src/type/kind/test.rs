macro_rules! primitive {
    ($env:expr, $primitive:expr) => {
        instantiate(&mut $env, TypeKind::Primitive($primitive))
    };

    ($env:expr, $name:ident, $primitive:expr) => {
        let $name = primitive!($env, $primitive);
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.as_primitive().expect("should be a primitive"));
        let $name = $name.as_ref();
    };
}

macro_rules! tuple {
    ($env:expr, $arguments:expr, $fields:expr) => {{
        let fields = $fields.into_iter().collect();

        instantiate(
            &mut $env,
            TypeKind::Tuple(TupleType {
                fields,
                arguments: $arguments.into_iter().collect(),
            }),
        )
    }};

    ($env:expr, $name:ident, $fields:expr, $arguments:expr) => {
        let $name = tuple!($env, $fields, $arguments);
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.into_tuple().expect("should be a tuple"));
        let $name = $name.as_ref();
    };
}

macro_rules! union {
    ($env:expr, $variants:expr) => {{
        let variants = $variants.into_iter().collect();

        instantiate(&mut $env, TypeKind::Union(UnionType { variants }))
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
            let actual = &$env.arena[actual];
            assert_eq!(actual.kind, *expected);
        }
    };
}

macro_rules! assert_equiv {
    ($env:expr, $actual:expr, $expected:expr) => {
        let actual = $actual;
        let expected = $expected;

        assert_eq!(actual.len(), expected.len());

        let mut equiv_env = EquivalenceEnvironment::new(&$env);

        for (&actual, &expected) in actual.iter().zip(expected.iter()) {
            assert!(equiv_env.semantically_equivalent(actual, expected));
        }
    };
}

pub(crate) use assert_equiv;
pub(crate) use assert_kind;
pub(crate) use primitive;
pub(crate) use tuple;
pub(crate) use union;
