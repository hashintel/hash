FROM temporalio/auto-setup:1.20.2.0 as temporal-setup

COPY ./migrate.sh /migrate.sh

ENTRYPOINT ["/migrate.sh"]
