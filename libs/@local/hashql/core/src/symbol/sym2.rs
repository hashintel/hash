#![expect(non_upper_case_globals, clippy::min_ident_chars)]
use super::Symbol;

macro_rules! symbols {
    (@strings [$($acc:tt)*];) => {
        pub(crate) static SYMBOLS: &[&str] = &[
            $($acc),*
        ];
    };
    (@strings [$($acc:tt)*]; , $($rest:tt)*) => {
        symbols!(@strings [$($acc)*]; $($rest)*);
    };
    (@strings [$($acc:tt)*]; $module:ident : { $($inner:tt)* } $(, $($rest:tt)*)?) => {
        symbols!(@strings [$($acc)*]; $($inner)* $(, $($rest)*)?);
    };
    (@strings [$($acc:tt)*]; $name:ident : $value:literal $(, $($rest:tt)*)?) => {
        symbols!(@strings [$($acc)* $value]; $($($rest)*)?);
    };
    (@strings [$($acc:tt)*]; $name:ident $(, $($rest:tt)*)?) => {
        symbols!(@strings [$($acc)* (stringify!($name))]; $($($rest)*)?);
    };

    (@consts @cont [$($count:tt)*] [$($next:tt)*];) => {
        symbols!(@consts [$($count)*]; $($next)*);
    };
    (@consts @cont [$($count:tt)*] [$($next:tt)*]; , $($rest:tt)*) => {
        symbols!(@consts @cont [$($count)*] [$($next)*]; $($rest)*);
    };
    (@consts @cont [$($count:tt)*] [$($next:tt)*]; $name:ident : $value:literal $(, $($rest:tt)*)?) => {
        symbols!(@consts @cont [$($count)* ()] [$($next)*]; $($($rest)*)?);
    };
    (@consts @cont [$($count:tt)*] [$($next:tt)*]; $module:ident : { $($inner:tt)* } $(, $($rest:tt)*)?) => {
        symbols!(@consts @cont [$($count)* ()] [$($next)*];; $($inner)* $(, $($rest)*)?);
    };
    (@consts @cont [$($count:tt)*] [$($next:tt)*]; $name:ident $(, $($rest:tt)*)?) => {
        symbols!(@consts @cont [$($count)* ()] [$($next)*]; $($($rest)*)?);
    };

    (@consts [$($count:tt)*];) => {};
    (@consts [$($count:tt)*]; , $($rest:tt)*) => {
        symbols!(@consts [$($count)*]; $($rest)*);
    };
    (@consts [$($count:tt)*]; $name:ident : $value:literal $(, $($rest:tt)*)?) => {
        const _: () = { assert!(SYMBOLS[${count($count)}] == $value) };
        pub const $name: Symbol<'static> = Symbol::new_constant_unchecked(${count($count)});
        symbols!(@consts [$($count)* ()]; $($($rest)*)?);
    };
    (@consts [$($count:tt)*]; $module:ident : { $($inner:tt)* } $(, $($rest:tt)*)?) => {
        pub mod $module {
            use super::*;

            symbols!(@consts [$($count)*]; $($inner)*);
        }

        symbols!(@consts @cont [$($count)*] [$($($rest)*)?]; $($inner)*);
    };
    (@consts [$($count:tt)*]; $name:ident $(, $($rest:tt)*)?) => {
        const _: () = { assert!(SYMBOLS[${count($count)}] == stringify!($name)) };
        pub const $name: Symbol<'static> = Symbol::new_constant_unchecked(${count($count)});
        symbols!(@consts [$($count)* ()]; $($($rest)*)?);
    };

    (@path [] [$($path:ident)*];) => {
        $($path)::*
    };
    (@path [$next:tt $($rest:tt)*] [$($path:tt)*];) => {
        symbols!(@path [$($rest)*] [$next $($path)*];)
    };

    (@lookup [$(, $arm:expr => $value:expr)*] [$($path:tt),*];) => {
        #[expect(unsafe_code)]
        pub(crate) fn prime<S: core::hash::BuildHasher, A: core::alloc::Allocator>(map: &mut hashbrown::HashMap<&'static str, super::repr::Repr, S, A>) {
            debug_assert!(map.is_empty());
            map.reserve(SYMBOLS.len());

            $(
                // SAFETY: The declarative macro guarantees that the symbol is unique.
                unsafe { map.insert_unique_unchecked($arm, $value.into_repr()); }
            )*
        }
    };
    (@lookup [$($arms:tt)*] [$tail:tt $(, $path:tt)*]; | $($rest:tt)*) => {
        symbols!(@lookup [$($arms)*] [$($path),*]; $($rest)*);
    };
    (@lookup [$($arms:tt)*] [$($path:tt),*]; , $($rest:tt)*) => {
        symbols!(@lookup [$($arms)*] [$($path),*]; $($rest)*);
    };
    (@lookup [$($arms:tt)*] [$($path:tt),*]; $name:ident : $value:literal $(, $($rest:tt)*)?) => {
        symbols!(@lookup [$($arms)*, $value => symbols!(@path [$name $($path)*] [];)] [$($path),*]; $($($rest)*)?);
    };
    (@lookup [$($arms:tt)*] [$($path:tt),*]; $module:ident : { $($inner:tt)* } $(, $($rest:tt)*)?) => {
        symbols!(@lookup [$($arms)*] [$module $(, $path)*]; $($inner)* ,| $($($rest)*)?);
    };
    (@lookup [$($arms:tt)*] [$($path:tt),*]; $name:ident $(, $($rest:tt)*)?) => {
        symbols!(@lookup [$($arms)*, stringify!($name) => symbols!(@path [$name $($path)*] [];)] [$($path),*]; $($($rest)*)?);
    };

    (@table; $($items:tt)*) => {
        symbols!(@strings []; $($items)*);
        symbols!(@consts []; $($items)*);
        symbols!(@lookup [] [self]; $($items)*);
    };
}

symbols! {@table;
    // [tidy] sort alphabetically start
    access,
    add,
    and,
    archived,
    archived_by_id,
    bar,
    BaseUrl,
    bit_and,
    bit_not,
    bit_or,
    bit_shl,
    bit_shr,
    bit_xor,
    Boolean,
    collect,
    confidence,
    core,
    created_at_decision_time,
    created_at_transaction_time,
    created_by_id,
    decision_time,
    Dict,
    div,
    draft_id,
    dummy: "<!dummy!>",
    E,
    edition,
    edition_id,
    encodings,
    entity,
    entity_edition_id,
    entity_id,
    entity_type_ids,
    entity_uuid,
    eq,
    Err,
    filter,
    foo,
    gt,
    gte,
    id,
    index,
    inferred,
    input,
    input_exists: "$exists",
    Integer,
    Intersection,
    kernel,
    left_entity_confidence,
    left_entity_id,
    left_entity_provenance,
    link_data,
    List,
    lt,
    lte,
    math,
    metadata,
    mul,
    ne,
    Never,
    None,
    not,
    Null,
    null,
    Number,
    Ok,
    option,
    or,
    pow,
    properties,
    provenance,
    provided,
    r#as: "as",
    r#as_force: "as!",
    r#else: "else",
    r#false: "false",
    r#fn: "fn",
    r#if: "if",
    r#in: "in",
    r#is: "is",
    r#let: "let",
    r#mod: "mod",
    r#newtype: "newtype",
    r#true: "true",
    r#type: "type",
    r#use: "use",
    R,
    record_id,
    Result,
    right_entity_confidence,
    right_entity_id,
    right_entity_provenance,
    Some,
    special_form,
    String,
    sub,
    T,
    temporal_versioning,
    then: "then",
    thunk: "thunk",
    transaction_time,
    U,
    Union,
    Unknown,
    unknown,
    Url,
    vectors,
    web_id,
    // [tidy] sort alphabetically end

    internal: {
        ClosureEnv: "'<ClosureEnv>"
    },

    symbol: {
        // [tidy] sort alphabetically start
        ampamp: "&&",
        ampersand: "&",
        arrow: "->",
        arrow_head: "|>",
        asterisk: "*",
        exclamation: "!",
        excleq: "!=",
        brackets: "[]",
        caret: "^",
        colon: ":",
        colon_colon: "::",
        comma: ",",
        dollar: "$",
        dollar_question_mark: "$?",
        dot: ".",
        eq: "=",
        eqeq: "==",
        gt: ">",
        gteq: ">=",
        gtgt: ">>",
        lt: "<",
        lteq: "<=",
        ltlt: "<<",
        minus: "-",
        pipepipe: "||",
        pipe: "|",
        plus: "+",
        question_mark: "?",
        slash: "/",
        tilde: "~",
        // [tidy] sort alphabetically end
    },

    digit: {
        zero: "0",
        one: "1",
        two: "2",
        three: "3",
        four: "4",
        five: "5",
        six: "6",
        seven: "7",
        eight: "8",
        nine: "9",
    },

    path: {
        // [tidy] sort alphabetically start
        option: "::core::option::Option",
        some: "::core::option::Some",
        none: "::core::option::None",
        graph_head_entities: "::graph::head::entities",
        graph_body_filter: "::graph::body::filter",
        graph_tail_collect: "::graph::tail::collect",
        // [tidy] sort alphabetically end
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::SYMBOLS;

    #[test]
    fn symbols_are_unique() {
        let mut set = HashSet::with_capacity(SYMBOLS.len());

        for symbol in SYMBOLS {
            set.insert(*symbol);
        }

        assert_eq!(set.len(), SYMBOLS.len(), "duplicate symbol value found");
    }
}
