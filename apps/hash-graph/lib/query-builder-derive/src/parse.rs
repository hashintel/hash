use proc_macro::TokenStream;
use virtue::{
    prelude::*,
    utils::{parse_tagged_attribute, ParsedAttribute},
};

use crate::input::{QueryBuilderField, QueryBuilderInput, QueryBuilderVariant, Redirect};

pub fn parse(input: TokenStream) -> Result<TokenStream> {
    let parse = Parse::new(input)?;

    let (_, _, body) = parse.into_generator();

    let _input = QueryBuilderInput::try_from(body)?;
    Ok(TokenStream::new())
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
                    .map(QueryBuilderVariant::try_from)
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
                ParsedAttribute::Tag(tag) if tag.to_string() == "skip" => Some(true),
                _ => None,
            })
            .unwrap_or(false);

        if skip {
            return Ok(Self {
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
                        ParsedAttribute::Property(ident, literal)
                            if ident.to_string() == "next" =>
                        {
                            Some(literal)
                        }
                        _ => None,
                    });

                    match next {
                        Some(literal) => match literal.to_string().as_str() {
                            r#""remote""# => QueryBuilderField::Redirect(Redirect::Remote(
                                fields[0].r#type.clone(),
                            )),
                            r#""this""# => QueryBuilderField::Redirect(Redirect::This),
                            r#""properties""# => QueryBuilderField::Properties,
                            received => {
                                return Err(Error::custom_at(
                                    format!(
                                        "unrecognized `next` value, expected `remote`, \
                                         `properties` or `this`, received {received}"
                                    ),
                                    literal.span(),
                                ));
                            }
                        },
                        None => {
                            QueryBuilderField::Redirect(Redirect::Remote(fields[0].r#type.clone()))
                        }
                    }
                } else {
                    return Err(Error::custom(format!(
                        "unable to determine reference to `{}`, more than a single tuple element",
                        value.name
                    )));
                }
            }
        };

        Ok(Self {
            name: value.name,
            field,
        })
    }
}
