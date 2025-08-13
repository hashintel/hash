use alloc::collections::BTreeSet;

use error_stack::Report;
use rand::distr::Distribution;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    data_type::{
        DataType,
        schema::{DataTypeReference, DataTypeSchemaTag, DataTypeTag, ValueLabel},
    },
    id::{OntologyTypeVersion, ParseBaseUrlError},
    json_schema::{SingleValueConstraints, ValueConstraints},
};

use super::Producer;
use crate::{
    data_type::{
        BOOLEAN_V1_TYPE, NULL_V1_TYPE, NUMBER_V1_TYPE, OBJECT_V1_TYPE, TEXT_V1_TYPE, VALUE_V1_TYPE,
    },
    seeding::{
        context::{LocalId, ProduceContext},
        producer::slug_from_title,
    },
};

mod scopes {
    use crate::seeding::context::Scope;

    pub(crate) const DOMAIN: Scope = Scope::new(b"DOMN");
    pub(crate) const WEB_SHORTNAME: Scope = Scope::new(b"WBSN");
    pub(crate) const TITLE: Scope = Scope::new(b"TITL");
    pub(crate) const DESCRIPTION: Scope = Scope::new(b"DESC");
    pub(crate) const CONSTRAINT: Scope = Scope::new(b"CNST");
}

#[derive(Debug)]
pub struct DataTypeProducer<DomainD, WebD, TitleD, DescriptionD, ConstraintsD> {
    pub local_id: LocalId,
    pub domain: DomainD,
    pub web_shortname: WebD,
    pub title: TitleD,
    pub description: DescriptionD,
    pub constraints: ConstraintsD,
}

impl<DomainD, WebD, TitleD, DescriptionD, ConstraintsD> Producer<DataType>
    for DataTypeProducer<DomainD, WebD, TitleD, DescriptionD, ConstraintsD>
where
    DomainD: Distribution<String>,
    WebD: Distribution<String>,
    TitleD: Distribution<String>,
    DescriptionD: Distribution<String>,
    ConstraintsD: Distribution<ValueConstraints>,
{
    type Error = Report<ParseBaseUrlError>;

    fn generate(&mut self, context: &ProduceContext) -> Result<DataType, Self::Error> {
        let global_id = context.global_id(self.local_id.take_and_advance());

        let constraints = self
            .constraints
            .sample(&mut context.rng(global_id, scopes::CONSTRAINT));

        let parent = match &constraints {
            ValueConstraints::Typed(typed) => match &**typed {
                SingleValueConstraints::String(_) => TEXT_V1_TYPE.id.clone(),
                SingleValueConstraints::Number(_) => NUMBER_V1_TYPE.id.clone(),
                SingleValueConstraints::Boolean => BOOLEAN_V1_TYPE.id.clone(),
                SingleValueConstraints::Null => NULL_V1_TYPE.id.clone(),
                SingleValueConstraints::Object => OBJECT_V1_TYPE.id.clone(),
                SingleValueConstraints::Array(_) => VALUE_V1_TYPE.id.clone(),
            },
            ValueConstraints::AnyOf(_) => VALUE_V1_TYPE.id.clone(),
        };

        let title = self
            .title
            .sample(&mut context.rng(global_id, scopes::TITLE));

        Ok(DataType {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: VersionedUrl {
                base_url: BaseUrl::new(format!(
                    "{}/@{}/types/data-type/{global_id:x}-{}/",
                    self.domain
                        .sample(&mut context.rng(global_id, scopes::DOMAIN)),
                    self.web_shortname
                        .sample(&mut context.rng(global_id, scopes::WEB_SHORTNAME)),
                    slug_from_title(&title)
                ))?,
                version: OntologyTypeVersion::new(1),
            },
            title,
            title_plural: None,
            icon: None,
            description: self
                .description
                .sample(&mut context.rng(global_id, scopes::DESCRIPTION)),
            label: ValueLabel::default(),
            all_of: BTreeSet::from([DataTypeReference { url: parent }]),
            r#abstract: false,
            constraints,
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::error::Error;

    use rand_distr::{Alphanumeric, Uniform};

    use super::*;
    use crate::seeding::{
        context::LocalId,
        distributions::{
            VectorDistribution, WeightedChoose,
            constraints::value::tests::sample_value_constraints_distribution,
        },
        test_utils::test_deterministic_producer,
    };

    pub(crate) fn sample_data_type_producer() -> Result<impl Producer<DataType>, Box<dyn Error>> {
        Ok(DataTypeProducer {
            local_id: LocalId::default(),
            domain: WeightedChoose::new([
                ("https://hash.ai".to_owned(), 40),
                ("https://blockprotocol.org".to_owned(), 30),
                ("http://localhost:3000".to_owned(), 30),
            ])?,
            web_shortname: WeightedChoose::new([
                ("acme".to_owned(), 40),
                ("blockprotocol".to_owned(), 30),
                ("localhost".to_owned(), 30),
            ])?,
            title: VectorDistribution {
                len: Uniform::new(4, 8)?,
                value: Alphanumeric,
            }
            .map(|utf8| String::from_utf8(utf8).expect("should be able to convert to string")),
            description: VectorDistribution {
                len: Uniform::new(40, 50)?,
                value: Alphanumeric,
            }
            .map(|utf8| String::from_utf8(utf8).expect("should be able to convert to string")),
            constraints: sample_value_constraints_distribution()?,
        })
    }

    #[test]
    fn deterministic_constraints_producer() {
        test_deterministic_producer(|| {
            sample_data_type_producer().expect("should be able to sample data type generator")
        });
    }
}
