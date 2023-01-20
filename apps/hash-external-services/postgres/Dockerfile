# Wal2json install steps from
# https://github.com/debezium/container-images/tree/906b855c71054d5598639d14f8718e0c4e54e98d/postgres/14-alpine
FROM postgres:14-alpine3.16

ENV WAL2JSON_COMMIT_ID=wal2json_2_3

RUN apk add --no-cache --virtual .build-deps gcc clang llvm git make musl-dev pkgconf \
    && git clone https://github.com/eulerto/wal2json -b master --single-branch \
    && (cd /wal2json && git checkout $WAL2JSON_COMMIT_ID && make && make install) \
    && rm -rf wal2json \
    && apk del .build-deps \
    && echo "local  postgres  postgres  trust" >> /var/lib/postgresql/data/pg_hba.conf \
    && mkdir -p /etc/postgresql/

COPY postgresql.conf /etc/postgresql
