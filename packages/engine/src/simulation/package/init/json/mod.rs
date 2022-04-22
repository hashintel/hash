use execution::{
    package::{
        init::{json::JsonInit, InitPackage, InitPackageCreator, InitialStateName},
        PackageComms, PackageCreator, PackageCreatorConfig, PackageInitConfig,
    },
    Error, Result,
};
use serde_json::Value;
use stateful::field::FieldSpecMapAccessor;

pub struct JsonInitCreator;

impl<C> InitPackageCreator<C> for JsonInitCreator {
    fn create(
        &self,
        _config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        _comms: PackageComms<C>,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &init_config.initial_state.name {
            InitialStateName::InitJson => Ok(Box::new(JsonInit {
                initial_state_src: init_config.initial_state.src.clone(),
            })),
            name => {
                return Err(Error::from(format!(
                    "Trying to create a JSON init package but the init file didn't end in .json \
                     but instead was: {:?}",
                    name
                )));
            }
        }
    }
}

impl PackageCreator for JsonInitCreator {
    fn init_message(&self) -> Result<Value> {
        // TODO: possibly pass init.json here to optimize
        Ok(Value::Null)
    }
}
