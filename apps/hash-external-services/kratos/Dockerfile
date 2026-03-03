FROM oryd/kratos:v25.4

USER root

RUN mkdir -p /etc/config/kratos && \
    mkdir -p /home/ory/.postgresql

COPY ./templates /etc/config/kratos/templates
COPY ./hooks /etc/config/kratos/hooks
COPY ./identity.schema.json /etc/config/kratos/
COPY kratos.yml /etc/config/kratos/kratos.yml

# Add AWS certificate bundle for SSL connection
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/ory/.postgresql/root.crt
RUN chown -R ory:ory /home/ory && \
    chmod a+r /home/ory/.postgresql

USER ory

ENTRYPOINT ["kratos", "-c", "/etc/config/kratos/kratos.yml"]
CMD ["serve", "--watch-courier"]
