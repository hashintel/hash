import { IntegrationInfo } from "../../../temporal/integration-workflows/createOrgIntegrationsManager";
import {
  OrgIntegration,
  OrgIntegrationConfigurationField,
  OrgIntegrationPerformance,
} from "../../apiTypes.gen";

export function integrationInfoToGQLOrgIntegration(
  info: IntegrationInfo,
): OrgIntegration {
  return {
    enabled: info.state.enabled,
    fields: Object.entries(info.definition.setupFields).map(
      ([fieldKey, fieldDef]): OrgIntegrationConfigurationField => ({
        fieldKey,
        label: fieldDef.label,
        required: fieldDef.required,
        secret: fieldDef.secret,
        currentValue: fieldDef.secret
          ? // don't re-emit secret values
            "******"
          : // TODO: check these Date toString?
            info.state.configuredFields[fieldKey]?.currentValue?.toString() ??
            fieldDef.defaultValue?.toString(),
        lastUpdatedAt:
          info.state.configuredFields[fieldKey]?.updatedAtISO || undefined,
      }),
    ),
    integrationName: info.state.integrationName,
    integrationId: info.workflowId,
    performances: info.state.performances.map(
      (p): OrgIntegrationPerformance => ({
        startedAt: p.startedAtISO,
        durationMs: p.settled?.durationMs,
        // mvp
        message: p.settled?.message ?? "In progress",
      }),
    ),
  };
}
