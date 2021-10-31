use super::{context, init, output, state};

use crate::simulation::{Error, Result};

use crate::simulation;
use crate::simulation::packages::name::PackageName;

pub struct Dependencies {
    inner: Vec<PackageName>,
}

impl Dependencies {
    pub fn new() -> Dependencies {
        Self::empty()
    }

    pub fn empty() -> Dependencies {
        Dependencies { inner: Vec::new() }
    }

    fn add_dependency(&mut self, dep: PackageName) -> Result<()> {
        self.inner.push(dep);
        Ok(())
    }

    fn add_dependency_with_ignore(&mut self, dep: PackageName) -> Result<()> {
        if !self.inner.contains(&dep) {
            self.add_dependency(dep)?;
        }
        Ok(())
    }

    pub fn add_context_dep(&mut self, name: context::Name) -> Result<()> {
        let dependency = PackageName::Context(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_init_dep(&mut self, name: init::Name) -> Result<()> {
        let dependency = PackageName::Init(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_state_dep(&mut self, name: state::Name) -> Result<()> {
        let dependency = PackageName::State(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
    }

    pub fn add_output_dep(&mut self, name: output::Name) -> Result<()> {
        let dependency = PackageName::Output(name);
        self.validate_clash(&dependency)?;
        self.add_dependency(dependency)
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
    pub fn get_child_dependencies(&self) -> simulation::Result<Dependencies> {
        fn error(name: &str) -> Error {
            Error::from(format!("Cannot find package with name {}", name))
        }
        match self {
            PackageName::Context(name) => {
                let pkg = context::packages::PACKAGES
                    .get(name)
                    .ok_or_else(|| error(name.into()))?;
                pkg.get_dependencies()
            }
            PackageName::Init(name) => {
                let pkg = init::packages::PACKAGES
                    .get(name)
                    .ok_or_else(|| error(name.into()))?;
                pkg.get_dependencies()
            }
            PackageName::State(name) => {
                let pkg = state::packages::PACKAGES
                    .get(name)
                    .ok_or_else(|| error(name.into()))?;
                pkg.get_dependencies()
            }
            PackageName::Output(name) => {
                let pkg = output::packages::PACKAGES
                    .get(name)
                    .ok_or_else(|| error(name.into()))?;
                pkg.get_dependencies()
            }
        }
    }

    pub fn get_all_dependencies(&self) -> simulation::Result<Dependencies> {
        let mut merged = Dependencies::new();
        for dependency in self.get_child_dependencies()?.into_iter_deps() {
            merged.add_dependency_with_ignore(dependency)?;
            let deps = dependency.get_all_dependencies()?;
            for dep in deps.into_iter_deps() {
                merged.add_dependency_with_ignore(dep)?;
            }
        }
        Ok(merged)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::simulation::{Error, Result};

    fn validate(mut parents: Vec<PackageName>, src_dep: PackageName) -> Result<()> {
        let cycle_found = parents.contains(&src_dep);
        parents.push(src_dep);
        if cycle_found {
            return Err(Error::from(format!(
                "Found cyclical dependency chain {:?}",
                parents
            )));
        } else {
            // Safe unwrap as we've added an element to `parents`
            let deps = parents.last().unwrap().get_child_dependencies()?;
            for dep in deps.into_iter_deps() {
                validate(parents.clone(), dep)?;
            }
        }
        Ok(())
    }

    macro_rules! validate {
        ($module:ident, $var:expr) => {
            for (name, creator) in $module::PACKAGES.iter() {
                validate(vec![], $var(name.clone()))?;
            }
        };
    }

    #[test]
    fn validate_dependencies() -> Result<()> {
        validate!(context, PackageName::Context);
        validate!(init, PackageName::Init);
        validate!(state, PackageName::State);
        validate!(output, PackageName::Output);
        Ok(())
    }
}
