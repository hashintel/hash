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
        let mut arguments = $arguments;
        let arguments = $env.intern_generic_arguments(&mut arguments);

        instantiate(&$env, TypeKind::Tuple(TupleType { fields, arguments }))
    }};

    ($env:expr, $name:ident, $fields:expr, $arguments:expr) => {
        let $name = tuple!($env, $fields, $arguments);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.tuple().expect("should be a tuple"));
    };
}

macro_rules! r#struct {
    ($env:expr, $arguments:expr, $fields:expr) => {{
        let mut fields = $fields;
        let fields = $env
            .intern_struct_fields(&mut fields)
            .expect("should not have any duplicate fields");
        let mut arguments = $arguments;
        let arguments = $env.intern_generic_arguments(&mut arguments);

        instantiate(&$env, TypeKind::Struct(StructType { fields, arguments }))
    }};

    ($env:expr, $name:ident, $fields:expr, $arguments:expr) => {
        let $name = r#struct!($env, $fields, $arguments);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.r#struct().expect("should be a struct"));
    };
}

macro_rules! struct_field {
    ($env:expr, $name:expr, $value:expr) => {
        StructField {
            name: $env.heap.intern_symbol($name),
            value: $value,
        }
    };
}

macro_rules! closure {
    ($env:expr, $arguments:expr, $params:expr, $returns:expr) => {{
        let params = $env.intern_type_ids(&$params);

        let mut arguments = $arguments;
        let arguments = $env.intern_generic_arguments(&mut arguments);

        instantiate(
            &$env,
            TypeKind::Closure(ClosureType {
                params,
                returns: $returns,
                arguments,
            }),
        )
    }};

    ($env:expr, $name:ident, $arguments:expr, $params:expr, $returns:expr) => {
        let $name = closure!($env, $arguments, $params, $returns);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.closure().expect("should be a closure"));
    };
}

macro_rules! union {
    ($env:expr, $variants:expr) => {{
        let variants = $env.intern_type_ids(&$variants);

        instantiate(&$env, TypeKind::Union(UnionType { variants }))
    }};

    ($env:expr, $name:ident, $variants:expr) => {
        let $name = union!($env, $variants);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.union().expect("should be a union"));
    };
}

macro_rules! intersection {
    ($env:expr, $variants:expr) => {{
        let variants = $env.intern_type_ids(&$variants);

        instantiate(&$env, TypeKind::Intersection(IntersectionType { variants }))
    }};

    ($env:expr, $name:ident, $variants:expr) => {
        let $name = intersection!($env, $variants);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| kind.intersection().expect("should be an intersection"));
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
    ($env:expr, $actual:expr, $expected:expr $(, $substitution:expr)?) => {
        let actual = $actual;
        let expected = $expected;

        assert_eq!(actual.len(), expected.len());

        let mut equiv_env = AnalysisEnvironment::new(&$env);
        $(equiv_env.set_substitution($substitution);)?

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

macro_rules! opaque {
    ($env:expr, $name:expr, $repr:expr, $arguments:expr) => {{
        let repr = $repr;
        let name = $env.heap.intern_symbol($name);

        let mut arguments = $arguments;
        let arguments = $env.intern_generic_arguments(&mut arguments);

        instantiate(
            &$env,
            TypeKind::Opaque(OpaqueType {
                name,
                repr,
                arguments,
            }),
        )
    }};

    ($env:expr, $var_name:ident, $name:expr, $repr:expr, $arguments:expr) => {
        let $var_name = opaque!($env, $name, $repr, $arguments);
        let $var_name = $env.types[$var_name].copied();
        let $var_name = $var_name.map(|kind| kind.opaque().expect("should be an opaque type"));
    };
}

macro_rules! list {
    ($env:expr, $element:expr) => {{
        let element = $element;

        instantiate(
            &$env,
            TypeKind::Intrinsic(IntrinsicType::List(ListType { element })),
        )
    }};

    ($env:expr, $name:ident, $element:expr) => {
        let $name = list!($env, $element);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| {
            kind.intrinsic()
                .expect("should be an intrinsic type")
                .list()
                .expect("should be a list type")
        });
    };
}

macro_rules! dict {
    ($env:expr, $key:expr, $value:expr) => {{
        let key = $key;
        let value = $value;

        instantiate(
            &$env,
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })),
        )
    }};

    ($env:expr, $name:ident, $key:expr, $value:expr) => {
        let $name = dict!($env, $key, $value);
        let $name = $env.types[$name].copied();
        let $name = $name.map(|kind| {
            kind.intrinsic()
                .expect("should be an intrinsic type")
                .dict()
                .expect("should be a dict type")
        });
    };
}

macro_rules! assert_sorted_eq {
    ($left:expr, $right:expr $(, $message:expr)?) => {{
        let mut left = $left;
        let mut right = $right;

        left.sort();
        right.sort();

        assert_eq!(left, right, $($message)?);
    }};
}

pub(crate) use assert_equiv;
pub(crate) use assert_kind;
pub(crate) use assert_sorted_eq;
pub(crate) use closure;
pub(crate) use dict;
pub(crate) use intersection;
pub(crate) use list;
pub(crate) use opaque;
pub(crate) use primitive;
pub(crate) use r#struct;
pub(crate) use struct_field;
pub(crate) use tuple;
pub(crate) use union;
