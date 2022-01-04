#[derive(Debug, Default)]
pub struct Meta {
    removed_ids: Vec<String>,
}

impl Meta {
    pub fn removed_batch(&mut self, id: String) {
        self.removed_ids.push(id);
    }
}
