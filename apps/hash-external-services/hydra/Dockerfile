FROM oryd/hydra:v2.2.0

USER root

RUN mkdir -p /home/ory/.postgresql

# Add AWS certificate bundle for SSL connection
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/ory/.postgresql/root.crt
RUN chown -R ory:ory /home/ory && \
    chmod a+r /home/ory/.postgresql

USER ory

ENTRYPOINT ["hydra"]

CMD ["serve", "all"]
