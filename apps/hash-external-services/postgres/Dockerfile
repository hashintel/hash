FROM postgres:16-alpine3.22

ENV WAL2JSON_COMMIT_ID=wal2json_2_6

RUN apk add --no-cache --virtual .build-deps gcc clang19 llvm19 git make musl-dev pkgconf \
    && git clone https://github.com/eulerto/wal2json -b master --single-branch \
    && (cd /wal2json && git checkout $WAL2JSON_COMMIT_ID && make && make install) \
    && git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git \
    && (cd /pgvector && make && make install) \
    && rm -rf wal2json ppgvector \
    && apk del .build-deps \
    && mkdir -p /etc/postgresql/
