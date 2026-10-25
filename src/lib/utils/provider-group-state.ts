import { PROVIDER_GROUP } from "@/lib/constants/provider.constants";
import { normalizeProviderGroup, parseProviderGroups } from "./provider-group";

interface GroupedProvider {
  isEnabled: boolean;
  groupTag: string | null;
  disabledGroups?: string[];
}

export function getProviderGroups(provider: Pick<GroupedProvider, "groupTag">): string[] {
  return parseProviderGroups(normalizeProviderGroup(provider.groupTag));
}

// A route prefix selects one group. Otherwise any enabled group shared with the
// key/user permits scheduling; wildcard access still respects group switches.
export function isProviderEnabledForGroups(
  provider: GroupedProvider,
  userGroups: string | null = null,
  routePrefix: string | null = null
): boolean {
  if (!provider.isEnabled) return false;
  const groups = getProviderGroups(provider);
  const requested = userGroups ? parseProviderGroups(userGroups) : null;
  const allowed = (group: string) =>
    !requested || requested.includes(PROVIDER_GROUP.ALL) || requested.includes(group);

  return groups.some(
    (group) =>
      (!routePrefix || group === routePrefix) &&
      allowed(group) &&
      !provider.disabledGroups?.includes(group)
  );
}
