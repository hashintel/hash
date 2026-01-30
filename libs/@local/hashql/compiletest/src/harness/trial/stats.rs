use core::time::Duration;
use std::{fs, io, path::Path, time::Instant};

pub enum TrialSection {
    ReadSource,
    Run,
    Parse,
    Assert,
    Verify,
    RenderStderr,
}

#[derive(Debug, Clone, Default)]
pub struct TrialStatistics {
    pub files_read: usize,
    pub bytes_read: usize,

    pub files_written: usize,
    pub bytes_written: usize,

    pub files_removed: usize,

    pub total: Duration,
    pub run: Duration,
    pub assert: Duration,
    pub verify: Duration,
    pub read_source: Duration,
    pub parse: Duration,
    pub render_stderr: Duration,
}

impl TrialStatistics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn panic() -> Self {
        Self::new()
    }

    pub fn read_file_to_string(&mut self, path: impl AsRef<Path>) -> io::Result<String> {
        let content = fs::read_to_string(path)?;

        self.files_read += 1;
        self.bytes_read += content.len();

        Ok(content)
    }

    pub fn write_file(
        &mut self,
        path: impl AsRef<Path>,
        content: impl AsRef<[u8]>,
    ) -> io::Result<()> {
        let bytes_written = content.as_ref().len();
        fs::write(path, content)?;

        self.files_written += 1;
        self.bytes_written += bytes_written;

        Ok(())
    }

    pub fn remove_file(&mut self, path: impl AsRef<Path>) -> io::Result<()> {
        fs::remove_file(path)?;

        self.files_removed += 1;

        Ok(())
    }

    pub fn time<T>(&mut self, section: TrialSection, closure: impl FnOnce(&mut Self) -> T) -> T {
        let now = Instant::now();
        let output = closure(self);
        let elapsed = now.elapsed();

        match section {
            TrialSection::Run => self.run += elapsed,
            TrialSection::Assert => self.assert += elapsed,
            TrialSection::Verify => self.verify += elapsed,
            TrialSection::ReadSource => self.read_source += elapsed,
            TrialSection::Parse => self.parse += elapsed,
            TrialSection::RenderStderr => self.render_stderr += elapsed,
        }

        output
    }

    pub fn plus(&mut self, other: &Self) {
        let Self {
            files_read,
            bytes_read,
            files_written,
            bytes_written,
            files_removed,
            total,
            run,
            assert,
            verify,
            read_source,
            parse,
            render_stderr,
        } = self;

        *files_read += other.files_read;
        *bytes_read += other.bytes_read;
        *files_written += other.files_written;
        *bytes_written += other.bytes_written;
        *files_removed += other.files_removed;
        *total += other.total;
        *run += other.run;
        *assert += other.assert;
        *verify += other.verify;
        *read_source += other.read_source;
        *parse += other.parse;
        *render_stderr += other.render_stderr;
    }
}
