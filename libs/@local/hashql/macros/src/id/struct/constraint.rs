use core::cmp;

use proc_macro2::{Ident, TokenStream};
use quote::quote;
use unsynn::ToTokens as _;

use crate::id::{
    common::{IntegerScalar, range_check},
    grammar,
};

enum RangeKind {
    Inclusive,
    Exclusive,
}

impl From<grammar::RangeOp> for RangeKind {
    fn from(op: grammar::RangeOp) -> Self {
        match op {
            grammar::RangeOp::Inclusive(_) => Self::Inclusive,
            grammar::RangeOp::Exclusive(_) => Self::Exclusive,
        }
    }
}

/// An explicit `is start..=end` bounds clause, ready for code generation.
pub(super) struct Constraint {
    scalar: IntegerScalar,
    kind: RangeKind,

    min: TokenStream,
    max: TokenStream,
}

impl Constraint {
    pub(super) fn new(scalar: IntegerScalar, bounds: grammar::StructBounds) -> Self {
        Self {
            scalar,
            kind: bounds.op.into(),

            min: bounds.start.into_token_stream(),
            max: bounds.end.into_token_stream(),
        }
    }

    // An endpoint is an arbitrary expression. Spliced into a larger expression its value changes
    // with what surrounds it: `2 | 8 - 1` is 7, and `(!0 >> 1) as u32` takes `!0` as an `i32`.
    // Every use therefore reads the endpoint through a binding of the id's scalar type.
    fn bound(&self, endpoint: &TokenStream, value: &TokenStream) -> TokenStream {
        let scalar = self.scalar;

        quote!({
            #[allow(unused_parens)]
            let bound: #scalar = #endpoint;
            #value
        })
    }

    fn end_value(&self) -> TokenStream {
        self.bound(&self.max, &quote!(bound))
    }

    pub(super) fn min_value(&self) -> TokenStream {
        self.bound(&self.min, &quote!(bound))
    }

    /// Expands to the largest value in the range, whichever way the range is declared.
    pub(super) fn max_value(&self) -> TokenStream {
        match self.kind {
            RangeKind::Inclusive => self.end_value(),
            RangeKind::Exclusive => self.bound(&self.max, &quote!(bound - 1)),
        }
    }

    pub(super) fn range(&self) -> String {
        let end = match self.kind {
            RangeKind::Inclusive => "]",
            RangeKind::Exclusive => ")",
        };

        format!("[{}, {}{end}", self.min, self.max)
    }

    fn message(&self) -> String {
        let op = match self.kind {
            RangeKind::Inclusive => "<=",
            RangeKind::Exclusive => "<",
        };

        format!("id value must be between {}{op}{}", self.min, self.max)
    }

    pub(super) fn comparison(&self, ident: &Ident, ident_scalar: IntegerScalar) -> TokenStream {
        let width = cmp::max(self.scalar, ident_scalar);
        let min = self.min_value();
        let max = self.max_value();

        quote! {
            (#ident as #width) >= (#min as #width) &&
            (#ident as #width) <= (#max as #width)
        }
    }

    pub(super) fn assertion(&self, ident: &Ident, ident_scalar: IntegerScalar) -> TokenStream {
        let comparison = self.comparison(ident, ident_scalar);

        range_check(&comparison, &self.message())
    }

    pub(super) fn range_assertion(&self) -> TokenStream {
        let min = self.min_value();
        let end = self.end_value();

        match self.kind {
            RangeKind::Inclusive => quote! {
                const _: () = assert!(#min <= #end, "inclusive range requires min <= max");
            },
            RangeKind::Exclusive => quote! {
                const _: () = assert!(#min < #end, "exclusive range requires min < max");
            },
        }
    }
}

/// Guard asserted when converting a possibly wider integer into an unbounded id.
pub(super) fn width_assertion(
    scalar: IntegerScalar,
    ident: &Ident,
    ident_scalar: IntegerScalar,
) -> TokenStream {
    if ident_scalar <= scalar {
        return TokenStream::new();
    }

    range_check(
        &quote!((#ident as #ident_scalar) <= (#scalar::MAX as #ident_scalar)),
        &format!("id value must fit in `{scalar}`"),
    )
}
