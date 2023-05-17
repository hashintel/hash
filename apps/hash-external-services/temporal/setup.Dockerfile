FROM temporalio/auto-setup:1.20.2.0 as temporal-setup

COPY setup.sh /run.sh

ENTRYPOINT ["/run.sh"]
