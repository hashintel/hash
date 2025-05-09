//! This module defines a collection of static symbol constants used throughout the codebase.
//!
//! # Usage
//!
//! These symbols should only ever be imported with the `sym` prefix to avoid naming conflicts
//! and maintain clarity about where the symbols are defined. For example:
//!
//! ```rust
//! use hashql_core::symbol::sym;
//!
//! // Correct usage:
//! let add_symbol = sym::lexical::add;
//! let asterisk = sym::symbol::asterisk;
//!
//! // Incorrect usage (avoid):
//! // use crate::symbol::sym::lexical::*;
//! ```
//!
//! These symbols provide pointer equality guarantees when interned from a `Heap`,
//! which allows for efficient symbol comparison operations.
#![expect(non_upper_case_globals, clippy::min_ident_chars)]
use hashql_macros::symbol_table;

symbol_table!(
    lexical: {
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
        Option,
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
        r#fn,
        r#if,
        r#is,
        r#let,
        r#mod,
        r#newtype,
        r#type,
        r#use,
        special_form,
        sub,
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
    symbol: {
        add: "+",
        ampersand: "&",
        and: "&&",
        asterisk: "*",
        backets: "[]",
        bit_shl: "<<",
        bit_shr: ">>",
        caret: "^",
        dot: ".",
        eq: "==",
        exclamation_mark: "!",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
        ne: "!=",
        or: "||",
        percent: "%"
        pipe: "|",
        question_mark: "?",
        slash: "/",
        sub: "-",
        tilde: "~",
    }
);

#[cfg(test)]
mod test {
    use core::ptr;

    use super::TABLES;
    use crate::{heap::Heap, symbol::sym};

    #[test]
    fn pointer_equality_from_heap() {
        let mut heap = Heap::new();

        let mul_heap = heap.intern_symbol("*");
        let mul_sym = sym::symbol::asterisk;

        assert!(ptr::eq(mul_heap.0, mul_sym.0));

        // Even after reset that should be the case
        heap.reset();

        let mul_heap = heap.intern_symbol("*");
        let mul_sym = sym::symbol::asterisk;

        assert!(ptr::eq(mul_heap.0, mul_sym.0));
    }

    #[test]
    fn ensure_no_collisions() {
        let mut set = std::collections::HashSet::new();
        for &symbol in TABLES {
            assert!(set.insert(symbol.0));
        }
    }
}
