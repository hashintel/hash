use crate::policies::Action;

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum ActionGroup {
    Anoynmous(Vec<Action>),
    Named(ActionGroupName),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionGroupName {
    View,
}

impl AsRef<str> for ActionGroupName {
    fn as_ref(&self) -> &str {
        match self {
            Self::View => "view",
        }
    }
}
