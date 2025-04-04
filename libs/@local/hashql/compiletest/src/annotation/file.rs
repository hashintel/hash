use core::str::pattern::{Pattern as _, Searcher as _};
use std::io::BufRead;

use super::{diagnostic::DiagnosticAnnotation, directive::Directive};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub(crate) struct FileAnnotations {
    pub diagnostics: Vec<DiagnosticAnnotation>,
    pub directive: Directive,
}

impl FileAnnotations {
    #[expect(clippy::string_slice)]
    fn parse_file(&mut self, mut reader: impl BufRead, load_diagnostics: bool) {
        // there are two types of annotations:
        // 1. general diagnostics
        // 2. diagnostic annotations

        // property follow the format of `//@<key>: <value>
        //
        // property annotations can only be at the beginning of a line!

        // In the file find any mention that's `//@`

        // first read the line directives
        let mut line = String::new();
        let mut line_number = 0;

        loop {
            line_number += 1;
            line.clear();

            if reader
                .read_line(&mut line)
                .expect("Should be able to read line")
                == 0
            {
                break;
            }

            let trimmed = line.trim_start();
            let Some(after_marker) = trimmed.strip_prefix(Directive::MARKER) else {
                // end of line annotations
                break;
            };

            self.directive
                .parse(after_marker)
                .expect("should be able to parse line directive");
        }

        if !load_diagnostics {
            return;
        }

        let mut last_annotation_line_number = None;

        // Load any diagnostics, these can be on any line
        loop {
            line_number += 1;
            line.clear();

            if reader
                .read_line(&mut line)
                .expect("Should be able to read line")
                == 0
            {
                break;
            }

            let mut searcher = DiagnosticAnnotation::MARKER.into_searcher(&line);
            let Some((_, end)) = searcher.next_match() else {
                last_annotation_line_number = None;
                continue;
            };

            let annotation =
                DiagnosticAnnotation::parse(&line[end..], line_number, last_annotation_line_number)
                    .expect("should have valid annotation");

            last_annotation_line_number = annotation.line;
            self.diagnostics.push(annotation);
        }
    }
}
