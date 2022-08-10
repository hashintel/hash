FROM alpine:3.16 as builder

## Install dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev

## Install rustup
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin
RUN wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal

## Copy the source files to the user's home directory
WORKDIR /usr/src
COPY ./hash_graph/ .

## Build the project
RUN cargo build --release --all-features


FROM alpine:3.16

COPY --from=builder /usr/src/target/release/hash-graph /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/hash-graph"]
