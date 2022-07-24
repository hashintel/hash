use crate::fmt::Line;

pub struct DebugDiagnostic {
    output: Line,
    text: Vec<String>,
}

impl DebugDiagnostic {
    pub fn next(output: String) -> Self {
        Self {
            output: Line::Next(output),
            text: vec![],
        }
    }

    pub fn defer(output: String) -> Self {
        Self {
            output: Line::Defer(output),
            text: vec![],
        }
    }

    pub fn and_text(mut self, text: String) -> Self {
        self.text.push(text);
        self
    }

    pub(crate) fn output(&self) -> &Line {
        &self.output
    }

    pub(crate) fn text(&self) -> &[String] {
        &self.text
    }
}
