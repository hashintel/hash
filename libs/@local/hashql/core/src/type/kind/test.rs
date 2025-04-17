macro_rules! primitive {
    ($env:expr, $name:ident, $primitive:expr) => {
        let $name = instantiate(&mut $env, TypeKind::Primitive($primitive));
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.as_primitive().expect("should be a primitive"));
        let $name = $name.as_ref();
    };
}

// Helper macro for creating tuple types in tests
macro_rules! tuple {
    ($env:expr, $name:ident, $fields:expr) => {
        let $name = instantiate(
            &mut $env,
            TypeKind::Tuple(TupleType {
                fields: $fields,
                arguments: GenericArguments::default(),
            }),
        );
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.into_tuple().expect("should be a tuple"));
        let $name = $name.as_ref();
    };
    // Allow creating tuple with specific arguments
    ($env:expr, $name:ident, $fields:expr, $arguments:expr) => {
        let $name = instantiate(
            &mut $env,
            TypeKind::Tuple(TupleType {
                fields: $fields,
                arguments: $arguments,
            }),
        );
        let $name = $env.arena[$name].clone();
        let $name = $name.map(|kind| kind.into_tuple().expect("should be a tuple"));
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

pub(crate) use assert_kind;
pub(crate) use primitive;
pub(crate) use tuple;
