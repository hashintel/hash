FROM debian:13.3-slim AS ca-certificates

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419+deb13u1


FROM oryd/kratos:v26.2.0-distroless

COPY --from=ca-certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY ./templates /etc/config/kratos/templates
COPY ./hooks /etc/config/kratos/hooks
COPY ./identity.schema.json /etc/config/kratos/
COPY kratos.yml /etc/config/kratos/kratos.yml

# Add AWS certificate bundle for SSL connection
WORKDIR /home/nonroot/.postgresql
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/nonroot/.postgresql/root.crt
WORKDIR /home/nonroot

USER 65532

ENTRYPOINT ["kratos", "-c", "/etc/config/kratos/kratos.yml"]
CMD ["serve", "--watch-courier"]
