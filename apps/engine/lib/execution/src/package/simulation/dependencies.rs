use crate::{
    package::simulation::{
        context::ContextPackageName, init::InitPackageName, output::OutputPackageName,
        state::StatePackageName, PackageName,
    },
    Error, Result,
};

#[derive(Clone, Default)]
pub struct Dependencies {
    inner: Vec<PackageName>,
}

impl Dependencies {
    pub fn new() -> Dependencies {
        Self::default()
    }

    pub fn empty() -> Dependencies {
        Self::default()
    }

    fn add_dependency(&mut self, dependency: PackageName) -> Result<()> {
        self.validate_clash(&dependency)?;
        self.inner.push(dependency);
        Ok(())
    }

    fn add_dependency_with_ignore(&mut self, dep: PackageName) -> Result<()> {
        if !self.inner.contains(&dep) {
            self.add_dependency(dep)?;
        }
        Ok(())
    }

    pub fn add_context_dep(&mut self, name: ContextPackageName) -> Result<()> {
        self.add_dependency(PackageName::Context(name))
    }

    pub fn add_init_dep(&mut self, name: InitPackageName) -> Result<()> {
        self.add_dependency(PackageName::Init(name))
    }

    pub fn add_state_dep(&mut self, name: StatePackageName) -> Result<()> {
        self.add_dependency(PackageName::State(name))
    }

    pub fn add_output_dep(&mut self, name: OutputPackageName) -> Result<()> {
        self.add_dependency(PackageName::Output(name))
    }

    pub fn contains(&self, dep: &PackageName) -> bool {
        self.inner.contains(dep)
    }

    pub fn iter_deps(&self) -> impl Iterator<Item = &PackageName> {
        self.inner.iter()
    }

    pub fn into_iter_deps(self) -> impl Iterator<Item = PackageName> {
        self.inner.into_iter()
    }

    fn validate_clash(&self, new: &PackageName) -> Result<()> {
        if self.contains(new) {
            return Err(Error::from(format!(
                "Dependencies ({:?}) already contain given dependency: {:?}",
                &self.inner, new
            )));
        }
        Ok(())
    }
}

impl PackageName {
    pub fn get_all_dependencies(&self) -> Result<Dependencies> {
        let mut merged = Dependencies::new();
        for dependency in self.get_dependencies()?.iter_deps() {
            merged.add_dependency_with_ignore(*dependency)?;
            let deps = dependency.get_all_dependencies()?;
            for dep in deps.into_iter_deps() {
                merged.add_dependency_with_ignore(dep)?;
            }
        }
        Ok(merged)
    }
}
