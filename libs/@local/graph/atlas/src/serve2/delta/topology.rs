#[derive(Debug)]
pub(crate) struct AdjacencyDelta {
    incoming: !,
    outgoing: !,
}

impl Clone for AdjacencyDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            incoming: self.incoming.clone(),
            outgoing: self.outgoing.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { incoming, outgoing } = self;
        incoming.clone_from(&source.incoming);
        outgoing.clone_from(&source.outgoing);
    }
}

#[derive(Debug)]
pub(crate) struct EndpointDelta {
    endpoints: !,
}

impl Clone for EndpointDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            endpoints: self.endpoints.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { endpoints } = self;
        endpoints.clone_from(&source.endpoints);
    }
}

#[derive(Debug)]
pub(crate) struct TopologyDelta {
    adjacency: AdjacencyDelta,
    endpoint: EndpointDelta,
}

impl Clone for TopologyDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            adjacency: self.adjacency.clone(),
            endpoint: self.endpoint.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            adjacency,
            endpoint,
        } = self;

        adjacency.clone_from(&source.adjacency);
        endpoint.clone_from(&source.endpoint);
    }
}
