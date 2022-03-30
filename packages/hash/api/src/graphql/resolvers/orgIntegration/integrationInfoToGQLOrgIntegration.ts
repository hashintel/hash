import { IntegrationInfo } from "../../../temporal/integration-workflows/getIntegrationInfo";
import {
  OrgIntegration,
  OrgIntegrationConfigurationField,
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
          info.state.configuredFields[fieldKey]?.updatedAt?.toISOString() ??
          undefined,
      }),
    ),
    integrationName: info.state.integrationName,
    integrationId: info.workflowId,
  };
}
