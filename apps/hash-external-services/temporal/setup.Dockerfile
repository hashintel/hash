ARG TEMPORAL_VERSION

FROM temporalio/auto-setup:${TEMPORAL_VERSION} as temporal-setup

COPY setup.sh /run.sh

ENTRYPOINT ["/run.sh"]
