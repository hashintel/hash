FROM oryd/kratos:v26.2.0-distroless

COPY ./templates /etc/config/kratos/templates
COPY ./hooks /etc/config/kratos/hooks
COPY ./identity.schema.json /etc/config/kratos/
COPY kratos.yml /etc/config/kratos/kratos.yml

# Add AWS certificate bundle for SSL connection
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/nonroot/.postgresql/root.crt

USER 65532

ENTRYPOINT ["kratos", "-c", "/etc/config/kratos/kratos.yml"]
CMD ["serve", "--watch-courier"]
