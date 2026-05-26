ARG TEMPORAL_VERSION

FROM temporalio/auto-setup:${TEMPORAL_VERSION} as temporal-setup

COPY ./migrate.sh /migrate.sh

USER temporal

ENTRYPOINT ["/migrate.sh"]
