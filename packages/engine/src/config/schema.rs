use std::sync::Arc;

use execution::package::simulation::PackageInitConfig;
use stateful::{
    agent::AgentSchema, context::ContextSchema, global::Globals, message::MessageSchema,
};

use crate::{config::Result, simulation::package::creator::PackageCreators};

pub struct SchemaConfig {
    pub agent_schema: Arc<AgentSchema>,
    pub message_schema: Arc<MessageSchema>,
    pub context_schema: Arc<ContextSchema>,
}

impl SchemaConfig {
    pub fn new(
        package_init_config: &PackageInitConfig,
        globals: &Globals,
        package_creators: &PackageCreators<'static>,
    ) -> Result<Self> {
        let agent_schema =
            Arc::new(package_creators.get_agent_schema(package_init_config, globals)?);
        let message_schema = Arc::new(MessageSchema::new());
        let context_schema =
            Arc::new(package_creators.get_context_schema(package_init_config, globals)?);

        Ok(Self {
            agent_schema,
            message_schema,
            context_schema,
        })
    }
}
