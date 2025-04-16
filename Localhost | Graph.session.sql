SELECT
    principal.id,
    role.name AS role,
    role.actor_group_id,
    coalesce(
        team.name, web.shortname, machine_actor.identifier, ai_actor.identifier
    ) AS ident,
    array_agg(principal.principal_type) AS type
FROM principal
LEFT OUTER JOIN
    entity_temporal_metadata
    ON principal.id = entity_temporal_metadata.entity_uuid
    AND entity_temporal_metadata.decision_time @> now()
    AND entity_temporal_metadata.transaction_time @> now()
LEFT OUTER JOIN
    entity_editions
    ON entity_temporal_metadata.entity_edition_id = entity_editions.entity_edition_id
LEFT OUTER JOIN actor_role ON principal.id = actor_role.actor_id
LEFT OUTER JOIN role ON actor_role.role_id = role.id
LEFT OUTER JOIN web ON principal.id = web.id
LEFT OUTER JOIN team ON principal.id = team.id
LEFT OUTER JOIN ai_actor ON principal.id = ai_actor.id
LEFT OUTER JOIN machine_actor ON principal.id = machine_actor.id
GROUP BY principal.id, shortname, role, actor_group_id, ident
ORDER BY shortname, ident;
