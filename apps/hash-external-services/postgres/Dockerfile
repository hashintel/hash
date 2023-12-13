# Wal2json install steps from
# https://github.com/debezium/container-images/tree/906b855c71054d5598639d14f8718e0c4e54e98d/postgres/14-alpine
FROM postgres:15-alpine3.18

ENV WAL2JSON_COMMIT_ID=wal2json_2_5

RUN apk add --no-cache --virtual .build-deps gcc clang15 llvm15 git make musl-dev pkgconf \
    && git clone https://github.com/eulerto/wal2json -b master --single-branch \
    && (cd /wal2json && git checkout $WAL2JSON_COMMIT_ID && make && make install) \
    && git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git \
    && (cd /pgvector && make && make install) \
    && rm -rf wal2json ppgvector \
    && apk del .build-deps \
    && echo "local  postgres  postgres  trust" >> /var/lib/postgresql/data/pg_hba.conf \
    && mkdir -p /etc/postgresql/

COPY postgresql.conf /etc/postgresql
