use alloc::collections::BTreeSet;

use proc_macro2::Ident;
use unsynn::{ToTokens as _, TokenStream, TokenTree, quote};

use super::grammar::{self, AttributeBody, IdAttribute};
use crate::grammar::Attribute;

pub(crate) enum DisplayAttribute {
    Auto,
    None,
    Format(TokenTree),
}

pub(crate) struct Spanned<T> {
    pub value: T,
    pub span: proc_macro::Span,
}

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq)]
pub(crate) enum Trait {
    Step,
}

/// Byte order selected by the `endian` attribute.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Endianness {
    Native,
    Little,
    Big,
}

pub(crate) struct Attributes {
    pub krate: TokenStream,
    pub r#const: TokenStream,
    pub display: DisplayAttribute,
    pub traits: BTreeSet<Trait>,

    pub endian: Option<Spanned<Endianness>>,
    /// The `unaligned` keyword token; presence turns the mode on, kept for error spans.
    pub unaligned: Option<proc_macro::Span>,

    pub extra: TokenStream,
}

impl Attributes {
    fn parse_attribute(&mut self, attribute: IdAttribute) {
        match attribute {
            IdAttribute::Crate { _crate, _eq, path } => self.krate = path.into_token_stream(),
            IdAttribute::Const { _const: r#const } => self.r#const = r#const.into_token_stream(),
            IdAttribute::Derive { _derive, traits } => {
                for r#trait in traits.content {
                    match r#trait.value {
                        grammar::IdDerive::Step(_) => {
                            self.traits.insert(Trait::Step);
                        }
                    }
                }
            }
            IdAttribute::Display {
                _display,
                _eq,
                format,
            } => match format {
                grammar::IdDisplay::None(_) => {
                    self.display = DisplayAttribute::None;
                }
                grammar::IdDisplay::Format(token_tree) => {
                    self.display = DisplayAttribute::Format(token_tree);
                }
            },
            IdAttribute::Endian {
                _endian: endian,
                _eq,
                value,
            } => {
                self.endian = Some(Spanned {
                    value: match value {
                        grammar::EndianValue::Little(_) => Endianness::Little,
                        grammar::EndianValue::Big(_) => Endianness::Big,
                        grammar::EndianValue::Native(_) => Endianness::Native,
                    },
                    span: AsRef::<Ident>::as_ref(&endian).span().unwrap(),
                });
            }
            IdAttribute::Unaligned {
                _unaligned: unaligned,
            } => {
                self.unaligned = Some(AsRef::<Ident>::as_ref(&unaligned).span().unwrap());
            }
        }
    }

    pub(crate) fn parse(attributes: Vec<Attribute<AttributeBody>>) -> Self {
        let mut this = Self {
            krate: quote!(::hashql_core),
            r#const: TokenStream::new(),
            display: DisplayAttribute::Auto,
            traits: BTreeSet::new(),
            endian: None,
            unaligned: None,
            extra: TokenStream::new(),
        };

        for attribute in attributes {
            match attribute.body.content {
                grammar::AttributeBody::Any(_) => {
                    this.extra.extend(attribute.into_token_stream());
                }
                grammar::AttributeBody::Id { _id: _, inner } => {
                    for attribute in inner.content {
                        this.parse_attribute(attribute.value);
                    }
                }
            }
        }

        this
    }
}
