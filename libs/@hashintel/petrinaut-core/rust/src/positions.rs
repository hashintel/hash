use alloc::collections::BTreeMap;

use crate::{
    CommitNodePositions, NodeKind, Patch,
    model::{Sdcpn, canonical_id},
    patch::Segment,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Address {
    subnet: Option<usize>,
    kind: NodeKind,
    index: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct Change {
    address: Address,
    before: (f64, f64),
    after: (f64, f64),
}

fn position(document: &Sdcpn, address: Address) -> Option<(f64, f64)> {
    let (places, transitions, components) = if let Some(index) = address.subnet {
        let subnet = document.subnets.as_ref()?.get(index)?;
        (
            &subnet.places,
            &subnet.transitions,
            &subnet.component_instances,
        )
    } else {
        (
            &document.places,
            &document.transitions,
            &document.component_instances,
        )
    };
    match address.kind {
        NodeKind::Place => places.get(address.index).map(|node| (node.x, node.y)),
        NodeKind::Transition => transitions.get(address.index).map(|node| (node.x, node.y)),
        NodeKind::ComponentInstance => components
            .as_ref()?
            .get(address.index)
            .map(|node| (node.x, node.y)),
    }
}

fn position_mut(document: &mut Sdcpn, address: Address) -> Option<(&mut f64, &mut f64)> {
    let (places, transitions, components) = if let Some(index) = address.subnet {
        let subnet = document.subnets.as_mut()?.get_mut(index)?;
        (
            &mut subnet.places,
            &mut subnet.transitions,
            &mut subnet.component_instances,
        )
    } else {
        (
            &mut document.places,
            &mut document.transitions,
            &mut document.component_instances,
        )
    };
    match address.kind {
        NodeKind::Place => places
            .get_mut(address.index)
            .map(|node| (&mut node.x, &mut node.y)),
        NodeKind::Transition => transitions
            .get_mut(address.index)
            .map(|node| (&mut node.x, &mut node.y)),
        NodeKind::ComponentInstance => components
            .as_mut()?
            .get_mut(address.index)
            .map(|node| (&mut node.x, &mut node.y)),
    }
}

fn changes(
    document: &Sdcpn,
    pending: BTreeMap<Address, (f64, f64)>,
) -> Result<Vec<Change>, String> {
    pending
        .into_iter()
        .filter_map(|(address, after)| {
            let Some(before) = position(document, address) else {
                return Some(Err("Position history target does not exist".to_owned()));
            };
            (before != after).then_some(Ok(Change {
                address,
                before,
                after,
            }))
        })
        .collect()
}

pub(crate) fn prepare(
    document: &Sdcpn,
    input: &CommitNodePositions,
) -> Result<Vec<Change>, String> {
    if input.target_subnet_id.as_deref() == Some("") {
        return Err("Subnet ID must not be empty".to_owned());
    }
    let subnet = input
        .target_subnet_id
        .as_deref()
        .map(|id| {
            let id = canonical_id(id);
            document
                .subnets
                .as_ref()
                .and_then(|subnets| subnets.iter().position(|subnet| subnet.id == id))
                .ok_or_else(|| format!("Subnet ID `{id}` does not exist"))
        })
        .transpose()?;
    let (places, transitions, components) = if let Some(index) = subnet {
        let target = document
            .subnets
            .as_ref()
            .and_then(|subnets| subnets.get(index))
            .ok_or("Subnet does not exist")?;
        (
            &target.places,
            &target.transitions,
            &target.component_instances,
        )
    } else {
        (
            &document.places,
            &document.transitions,
            &document.component_instances,
        )
    };
    let mut pending = BTreeMap::new();
    for commit in &input.commits {
        if !commit.position.x.is_finite() || !commit.position.y.is_finite() {
            return Err("Node positions must be finite numbers".to_owned());
        }
        if commit.id.is_empty() {
            return Err("Node ID must not be empty".to_owned());
        }
        let id = canonical_id(&commit.id);
        let index = match commit.item_type {
            NodeKind::Place => places.iter().position(|node| node.id == id),
            NodeKind::Transition => transitions.iter().position(|node| node.id == id),
            NodeKind::ComponentInstance => components
                .as_ref()
                .and_then(|nodes| nodes.iter().position(|node| node.id == id)),
        };
        if let Some(index) = index {
            pending.insert(
                Address {
                    subnet,
                    kind: commit.item_type,
                    index,
                },
                (commit.position.x, commit.position.y),
            );
        }
    }
    changes(document, pending)
}

pub(crate) fn combine<'a>(
    document: &Sdcpn,
    checkpoints: impl Iterator<Item = (&'a [Change], bool)>,
) -> Result<Vec<Change>, String> {
    let mut pending = BTreeMap::new();
    for (changes, forward) in checkpoints {
        for change in changes {
            pending.insert(
                change.address,
                if forward { change.after } else { change.before },
            );
        }
    }
    changes(document, pending)
}

#[expect(
    clippy::float_cmp,
    reason = "Patch emission preserves exact JavaScript coordinate equality"
)]
pub(crate) fn patches(changes: &[Change], forward: bool) -> Vec<Patch> {
    let mut patches = Vec::new();
    for change in changes {
        let mut path = Vec::new();
        if let Some(index) = change.address.subnet {
            path.extend([Segment::Key("subnets".to_owned()), Segment::Index(index)]);
        }
        path.push(Segment::Key(
            match change.address.kind {
                NodeKind::Place => "places",
                NodeKind::Transition => "transitions",
                NodeKind::ComponentInstance => "componentInstances",
            }
            .to_owned(),
        ));
        path.push(Segment::Index(change.address.index));
        for (coordinate, old, new) in [
            ("x", change.before.0, change.after.0),
            ("y", change.before.1, change.after.1),
        ] {
            if old != new {
                let mut path = path.clone();
                path.push(Segment::Key(coordinate.to_owned()));
                patches.push(Patch::replace(path, if forward { new } else { old }));
            }
        }
    }
    patches
}

pub(crate) fn apply(document: &mut Sdcpn, changes: &[Change]) {
    for change in changes {
        if let Some((x, y)) = position_mut(document, change.address) {
            *x = change.after.0;
            *y = change.after.1;
        }
    }
}
