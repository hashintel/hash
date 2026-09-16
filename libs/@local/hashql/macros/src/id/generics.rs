use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, format_ident, quote};

use super::grammar::TypeParameters;

pub(super) struct Generics {
    names: Vec<Ident>,
}

impl Generics {
    pub(super) fn new(parameters: Option<TypeParameters>) -> Self {
        Self {
            names: parameters
                .into_iter()
                .flat_map(|parameters| parameters.names)
                .map(|parameter| parameter.value)
                .collect(),
        }
    }

    pub(super) const fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    pub(super) fn parameters(&self) -> TokenStream {
        if self.is_empty() {
            return TokenStream::new();
        }

        let names = &self.names;
        quote!(<#(#names: ?Sized),*>)
    }

    pub(super) fn static_parameters(&self) -> TokenStream {
        if self.is_empty() {
            return TokenStream::new();
        }

        let names = &self.names;
        quote!(<#(#names: ?Sized + 'static),*>)
    }

    pub(super) fn field(&self) -> TokenStream {
        let marker = match self.names.as_slice() {
            [] => return TokenStream::new(),
            [name] => quote!(fn() -> #name),
            names => quote!((#(fn() -> #names,)*)),
        };

        quote! {
            #[doc(hidden)]
            _phantom: ::core::marker::PhantomData<#marker>,
        }
    }

    pub(super) fn initializer(&self) -> TokenStream {
        if self.is_empty() {
            TokenStream::new()
        } else {
            quote!(_phantom: ::core::marker::PhantomData,)
        }
    }

    pub(super) fn fresh_ident(&self, prefix: &str) -> Ident {
        for suffix in 0.. {
            let candidate = format_ident!("{prefix}{suffix}");
            let raw = Ident::new_raw(&candidate.to_string(), candidate.span());
            if !self.names.contains(&candidate) && !self.names.contains(&raw) {
                return candidate;
            }
        }

        unreachable!("a finite parameter list cannot exhaust identifier suffixes")
    }
}

impl ToTokens for Generics {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        if !self.is_empty() {
            let names = &self.names;
            tokens.extend(quote!(<#(#names),*>));
        }
    }
}
