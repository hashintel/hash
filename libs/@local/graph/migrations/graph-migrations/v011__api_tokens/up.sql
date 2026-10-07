CREATE TABLE api_token (
    token_id UUID PRIMARY KEY,
    token_type TEXT NOT NULL CHECK (token_type IN ('pat')),
    version SMALLINT NOT NULL CHECK (version IN (0)),
    actor_id UUID NOT NULL REFERENCES actor (id) ON DELETE CASCADE,
    web_id UUID NOT NULL REFERENCES web (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
    encryption_key_id UUID NOT NULL,
    encrypted_secret_hash BYTEA NOT NULL CHECK (length(encrypted_secret_hash) = 60),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    CHECK (expires_at > created_at)
);

CREATE INDEX idx_api_token_actor_id ON api_token (actor_id);
CREATE INDEX idx_api_token_web_id ON api_token (web_id);
