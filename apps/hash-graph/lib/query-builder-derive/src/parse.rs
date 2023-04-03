use proc_macro::{Literal, TokenStream};
use virtue::{
    parse::EnumBody,
    prelude::*,
    utils::{parse_tagged_attribute, ParsedAttribute},
};

use crate::input::{QueryBuilderField, QueryBuilderInput, QueryBuilderVariant, Redirect};

pub(crate) fn parse(input: TokenStream) -> Result<TokenStream> {
    let parse = Parse::new(input)?;

    let (mut generator, attributes, body) = parse.into_generator();
}

impl TryFrom<Body> for QueryBuilderInput {
    type Error = Error;

    fn try_from(value: Body) -> std::result::Result<Self, Self::Error> {
        match value {
            Body::Struct(_) => Err(Error::custom("only enums are supported")),
            Body::Enum(body) => {
                let variants: Result<Vec<_>> = body
                    .variants
                    .into_iter()
                    .map(|variant| QueryBuilderVariant::try_from(variant))
                    .collect();

                let variants = variants?;
                Ok(Self { variants })
            }
        }
    }
}

impl TryFrom<EnumVariant> for QueryBuilderVariant {
    type Error = Error;

    fn try_from(value: EnumVariant) -> std::result::Result<Self, Self::Error> {
        let attributes: Result<Vec<_>> = value
            .attributes
            .into_iter()
            .map(|attribute| parse_tagged_attribute(&attribute.tokens, "builder"))
            .collect();

        let attributes: Vec<_> = attributes?.into_iter().flatten().flatten().collect();

        let skip = attributes
            .iter()
            .find_map(|attribute| match attribute {
                ParsedAttribute::Tag("skip") => Some(true),
                ParsedAttribute::Property(..) => None,
            })
            .unwrap_or(false);

        if skip {
            return Ok(QueryBuilderVariant {
                name: value.name,
                field: QueryBuilderField::Skip,
            });
        }

        let field = match value.fields {
            None => QueryBuilderField::Bottom,
            Some(Fields::Struct(_)) => QueryBuilderField::Complex,
            Some(Fields::Tuple(fields)) => {
                if fields.len() == 1 {
                    // find out where we should go w/ the attribute set on variant
                    // can either be: Redirect or Properties
                    let next = attributes.iter().find_map(|attribute| match attribute {
                        ParsedAttribute::Property("next", literal) => Some(literal),
                        _ => None,
                    });

                    let redirect = match next {
                        Some(literal) => match literal.to_string().as_str() {
                            "remote" => Redirect::Remote(fields[0].r#type.clone()),
                            "this" => Redirect::This,
                            _ => {
                                return Err(Error::custom_at(
                                    "unrecognized `next` value, expected `remote` or `this`",
                                    literal.span(),
                                ));
                            }
                        },
                        None => Redirect::Remote(fields[0].r#type.clone()),
                    };

                    QueryBuilderField::Redirect(redirect)
                } else {
                    return Err(Error::custom(format!(
                        "unable to determine reference to `{}`, more than a single tuple element",
                        value.name
                    )));
                }
            }
        };

        Ok(QueryBuilderVariant {
            name: value.name,
            field,
        })
    }
}
