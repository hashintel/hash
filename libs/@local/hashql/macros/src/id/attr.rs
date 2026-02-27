use alloc::collections::BTreeSet;

use unsynn::{ToTokens as _, TokenStream, TokenTree, quote};

use super::grammar::{self, AttributeBody, IdAttribute};
use crate::grammar::Attribute;

pub(crate) enum DisplayAttribute {
    Auto,
    None,
    Format(TokenTree),
}

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq)]
pub(crate) enum Trait {
    Step,
}

pub(crate) struct Attributes {
    pub krate: TokenStream,
    pub r#const: TokenStream,
    pub display: DisplayAttribute,
    pub traits: BTreeSet<Trait>,

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
        }
    }

    pub(crate) fn parse(
        additional: Vec<grammar::IdAttribute>,
        attributes: Vec<Attribute<AttributeBody>>,
    ) -> Self {
        let mut this = Self {
            krate: quote!(crate),
            r#const: TokenStream::new(),
            display: DisplayAttribute::Auto,
            traits: BTreeSet::new(),
            extra: TokenStream::new(),
        };

        for attribute in additional {
            this.parse_attribute(attribute);
        }

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
