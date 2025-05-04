#![expect(non_upper_case_globals, clippy::min_ident_chars)]
use super::Symbol;

macro_rules! symbols {
    (@sym) => {};
    (@sym $name:ident $(, $($rest:tt)*)?) => {
        pub static $name: super::Symbol<'static> = super::Symbol::new_unchecked(stringify!($name));
        $(symbols!(@sym $($rest)*);)?
    };
    (@sym $name:ident : $value:literal $(, $($rest:tt)*)?) => {
        pub static $name: super::Symbol<'static> = super::Symbol::new_unchecked($value);
        $(symbols!(@sym $($rest)*);)?
    };
    (@table $module:ident $table:ident #($($name:ident)*)) => {
        pub(crate) const $table: &[&Symbol<'static>] = &[
            $(&$module::$name),*
        ];
    };
    (@table $module:ident $table:ident #($($acc:tt)*) $name:ident $(: $value:literal)? $(, $($rest:tt)*)?) => {
        symbols!(@table $module $table #($($acc)* $name) $($($rest)*)?);
    };
    ($module:ident; $table:ident; $($items:tt)*) => {
        pub mod $module {
            symbols!(@sym $($items)*);
        }

        symbols!(@table $module $table #() $($items)*);
    };
}

symbols![lexical; LEXICAL;
    BaseUrl,
    Boolean,
    Dict,
    E,
    Err,
    Integer,
    Intersection,
    List,
    Never,
    None,
    Null,
    Number,
    Ok,
    R,
    Result,
    Some,
    String,
    T,
    U,
    Union,
    Unknown,
    Url,
    access,
    add,
    and,
    bit_and,
    bit_not,
    bit_or,
    bit_shl,
    bit_shr,
    bit_xor,
    div,
    eq,
    gt,
    gte,
    index,
    input,
    kernel,
    lt,
    lte,
    math,
    mul,
    ne,
    not,
    or,
    pow,
    r#fn: "fn",
    r#if: "if",
    r#is: "is",
    r#let: "let",
    r#mod: "mod",
    r#newtype: "newtype",
    r#type: "type",
    r#use: "use",
    special_form,
    sub,
];

symbols![digit; DIGITS;
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
];

symbols![symbol; SYMBOLS;
    add: "+",
    ampersand: "&",
    and: "&&",
    asterisk: "*",
    backets: "[]",
    bit_shl: "<<",
    bit_shr: ">>",
    caret: "^",
    slash: "/",
    dot: ".",
    eq: "==",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    ne: "!=",
    not: "!",
    or: "||",
    pipe: "|",
    sub: "-",
    tilde: "~",
];

#[cfg(test)]
mod test {
    use core::ptr;

    use crate::{heap::Heap, symbol::sym};

    #[test]
    fn pointer_equality_from_heap() {
        let mut heap = Heap::new();

        let mul_heap = heap.intern_symbol("*");
        let mul_sym = sym::symbol::asterisk;

        assert!(ptr::eq(mul_heap.0, mul_sym.0));

        // even after reset that should be the case
        heap.reset();

        let mul_heap = heap.intern_symbol("*");
        let mul_sym = sym::symbol::asterisk;

        assert!(ptr::eq(mul_heap.0, mul_sym.0));
    }
}
