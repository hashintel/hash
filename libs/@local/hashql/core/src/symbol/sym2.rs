use phf::phf_map;

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
        pub const $name: Symbol<'static> = Symbol::new_constant_unchecked(${count($count)});
        symbols!(@consts [$($count)* ()]; $($($rest)*)?);
    };

    (@path [] [$($path:ident)*];) => {
        $($path)::*
    };
    (@path [$next:tt $($rest:tt)*] [$($path:tt)*];) => {
        symbols!(@path [$($rest)*] [$next $($path)*];)
    };

    (@lookup [$(, $arm:pat => $value:expr)*] [$($path:tt),*];) => {
        static LOOKUP: phf::Map<&'static str, Symbol<'static>> = phf_map! { $($arm => $value),* };
    };
    (@lookup [$($arms:tt)*] [$($path:tt),*];) => {

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

// symbols! {
//     access,
//     add,
//     and,
//     archived,
//     archived_by_id,
//     bar,
//     BaseUrl,
//     bit_and,
//     bit_not,
//     bit_or,
//     r#if: "if",
//     dummy: "<!dummy!>",

//     internal: {
//         ClosureEnv: "'<ClosureEnv>"
//     },

//     symbol: {
//         asterisk: "*",
//     },

//     digit: {
//         zero: "0",
//         one: "1",
//         /* and so on */
//     },

//     path: {
//         option: "::core::option::Option",
//         some: "::core::option::Some",
//         none: "::core::option::None",
//         graph_head_entities: "::graph::head::entities",
//         graph_body_filter: "::graph::body::filter",
//         graph_tail_collect: "::graph::tail::collect",
//     }
// }

symbols!(@table;
    access
);

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
