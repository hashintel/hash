FROM postgres:18.1-alpine3.23

RUN apk add --no-cache --virtual .build-deps gcc clang19 llvm19 git make musl-dev pkgconf \
    && git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git \
    && (cd /pgvector && make && make install) \
    && rm -rf pgvector \
    && apk del .build-deps \
    && mkdir -p /etc/postgresql/

USER postgres
