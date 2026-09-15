use core::cmp;

use proc_macro2::{Ident, TokenStream};
use quote::quote;
use unsynn::ToTokens as _;

use crate::id::{common::IntegerScalar, grammar};

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

    pub(super) const fn min_value(&self) -> &TokenStream {
        &self.min
    }

    pub(super) fn max_value(&self) -> TokenStream {
        let max = &self.max;
        match self.kind {
            RangeKind::Inclusive => quote!(#max),
            RangeKind::Exclusive => quote!(#max - 1),
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
        let min = &self.min;
        let max = &self.max;

        match self.kind {
            RangeKind::Inclusive => quote! {
                (#ident as #width) >= (#min as #width) &&
                (#ident as #width) <= (#max as #width)
            },
            RangeKind::Exclusive => quote! {
                (#ident as #width) >= (#min as #width) &&
                (#ident as #width) < (#max as #width)
            },
        }
    }

    pub(super) fn assertion(&self, ident: &Ident, ident_scalar: IntegerScalar) -> TokenStream {
        let comparison = self.comparison(ident, ident_scalar);
        let message = self.message();

        quote!(assert!((#comparison), #message);)
    }

    pub(super) fn range_assertion(&self) -> TokenStream {
        let Self {
            scalar,
            min,
            max,
            kind,
        } = self;

        match kind {
            RangeKind::Inclusive => quote! {
                const _: () = assert!((#min as #scalar) <= (#max as #scalar), "inclusive range requires min <= max");
            },
            RangeKind::Exclusive => quote! {
                const _: () = assert!((#min as #scalar) < (#max as #scalar), "exclusive range requires min < max");
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

    let message = format!("id value must fit in `{scalar}`");
    quote! {
        assert!((#ident as #ident_scalar) <= (#scalar::MAX as #ident_scalar), #message);
    }
}
