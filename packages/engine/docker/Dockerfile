FROM fedora:37 as builder

## Install the dependencies
RUN yum install gcc openssl-devel cmake -y

## Install rustup
# Setting `pipefail` to ensure `curl` will also exit docker build
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain none --profile minimal
ENV PATH $PATH:/root/.cargo/bin

## Copy the source files to the user's home directory
WORKDIR /usr/src
COPY . .

## Build the project
RUN cargo build -p cli -p hash_engine --release --all-features

## Add a non-root user
# Make the user and root configurable
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID hash
RUN useradd  \
    --uid $USER_UID  \
    --gid $USER_GID  \
    --no-create-home  \
    --shell /sbin/nologin  \
    hash


FROM fedora:37

COPY --from=builder /etc/passwd /etc/passwd
COPY --from=builder /etc/group /etc/group

COPY --from=builder --chown=hash /usr/src/target/release/cli /opt/engine/
COPY --from=builder --chown=hash /usr/src/target/release/hash_engine /opt/engine/

# TODO: Maybe an easier/more robust way?
COPY --from=builder --chown=hash /usr/src/lib/execution/src/runner/javascript/*.js /opt/engine/lib/execution/src/runner/javascript/
COPY --from=builder --chown=hash /usr/src/lib/execution/src/runner/python/*.py /opt/engine/lib/execution/src/runner/python/
COPY --from=builder --chown=hash /usr/src/lib/execution/src/package/simulation /opt/engine/lib/execution/src/package/simulation

ENV ENGINE_PATH /opt/engine/hash_engine

USER hash
WORKDIR /opt/engine
ENTRYPOINT ["/opt/engine/cli"]
CMD ["help"]
