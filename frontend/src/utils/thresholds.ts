import type { ThresholdMap, ThresholdOverride } from '../api/types';

/**
 * Most-specific-wins: an override scoped to this exact instance beats one scoped
 * to a tag the instance carries, which beats the global default. When an
 * instance carries multiple tags with conflicting overrides for the same
 * metric, the most sensitive (lowest critical) one wins so nothing gets missed.
 */
export function resolveThreshold(
  metricKey: string,
  instanceId: number,
  thresholds: ThresholdMap,
  overrides: ThresholdOverride[],
  instanceTagIds: Map<number, number[]>
): ThresholdMap[string] | null {
  const instanceOverride = overrides.find(
    (o) => o.scopeType === 'instance' && o.scopeId === instanceId && o.metricKey === metricKey
  );
  if (instanceOverride) return instanceOverride;

  const tagIds = instanceTagIds.get(instanceId) || [];
  const tagOverrides = overrides.filter(
    (o) => o.scopeType === 'tag' && o.metricKey === metricKey && tagIds.includes(o.scopeId)
  );
  if (tagOverrides.length > 0) {
    return tagOverrides.reduce((most, current) => (current.critical < most.critical ? current : most));
  }

  return thresholds[metricKey] || null;
}
