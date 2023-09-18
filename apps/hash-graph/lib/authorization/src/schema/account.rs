use graph_types::account::AccountId;
use uuid::Uuid;

use crate::zanzibar::Resource;

impl Resource for AccountId {
    type Id = Uuid;

    fn namespace() -> &'static str {
        "graph/account"
    }

    fn id(&self) -> &Self::Id {
        self.as_uuid()
    }
}
