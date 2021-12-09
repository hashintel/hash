use std::{collections::HashMap, marker::PhantomData};

use crate::datastore::UUID_V4_LEN;

pub struct APIResponseToAnonymous {
    pub from: &'static str,
    pub r#type: &'static str,
    pub data: String,
}

/// Struct returned by a custom message handler
pub struct APIResponseMap {
    pub from: &'static str,
    pub r#type: &'static str,
    pub map: HashMap<[u8; UUID_V4_LEN], Vec<String>>,
}

impl APIResponseMap {
    pub fn take_for_agent(&mut self, id: &[u8; UUID_V4_LEN]) -> Vec<APIResponseToAnonymous> {
        self.map
            .remove(id)
            .map(|v| {
                v.into_iter()
                    .map(|data| APIResponseToAnonymous {
                        from: self.from,
                        r#type: self.r#type,
                        data,
                    })
                    .collect()
            })
            .unwrap_or_else(|| vec![])
    }
}

/// Static string column representation for API messages
pub struct SizedStaticStringColumn {
    pub data: Vec<Vec<&'static str>>,
    /// Sum of string lengths
    pub char_count: usize,
}

/// String column representation for API messages
pub struct SizedStringColumn {
    pub data: Vec<Vec<String>>,
    /// Sum of string lengths
    pub char_count: usize,
}

/// Columnar native representation of external API responses
pub struct APIResponses<'a> {
    pub from: SizedStaticStringColumn,
    pub r#type: SizedStaticStringColumn,
    pub data: SizedStringColumn,
    /// Number of messages in total
    pub msg_count: usize,
    phantom: PhantomData<&'a ()>,
}

impl<'a> From<Vec<Vec<APIResponseToAnonymous>>> for APIResponses<'a> {
    fn from(v: Vec<Vec<APIResponseToAnonymous>>) -> Self {
        // TODO: performance: into_iter to access fields at same time and avoid clones
        APIResponses {
            from: SizedStaticStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.from).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.from.len()).sum::<usize>()
                }),
            },
            r#type: SizedStaticStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.r#type).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.r#type.len()).sum::<usize>()
                }),
            },
            data: SizedStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.data.clone()).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.data.len()).sum::<usize>()
                }),
            },
            msg_count: v.iter().fold(0, |acc, elem| acc + elem.len()),
            phantom: PhantomData,
        }
    }
}
