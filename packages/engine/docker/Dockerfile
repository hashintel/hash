FROM amazonlinux:2022

RUN yum update
RUN yum install gcc openssl-devel cmake -y

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain none --profile minimal
ENV PATH $PATH:/root/.cargo/bin

ADD . /code
WORKDIR /code

RUN cargo build --release --all-features
ENTRYPOINT ["target/release/cli"]
