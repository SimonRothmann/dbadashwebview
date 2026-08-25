import { describe, expect, it } from 'vitest';
import { resolveThreshold } from './thresholds';
import type { ThresholdMap, ThresholdOverride } from '../api/types';

/**
 * Precedence for threshold colour-coding: an override scoped to the exact
 * instance beats one scoped to a tag the instance carries, which beats the
 * global default. Getting this order wrong silently mis-colours the fleet
 * dashboard, which is the whole point of the feature.
 */

const global: ThresholdMap = {
  cpu: { warning: 70, critical: 90 },
  io: { warning: 20, critical: 40 },
};

const override = (
  metricKey: string,
  scopeType: 'instance' | 'tag',
  scopeId: number,
  warning: number,
  critical: number
): ThresholdOverride => ({ metricKey, scopeType, scopeId, warning, critical });

// instance 1 carries tags 10 and 11; instance 2 carries none.
const tagMembership = new Map<number, number[]>([[1, [10, 11]]]);

describe('resolveThreshold', () => {
  it('falls back to the global threshold when nothing overrides it', () => {
    expect(resolveThreshold('cpu', 1, global, [], tagMembership)).toEqual(global.cpu);
  });

  it('returns null when the metric has no global entry and no override', () => {
    expect(resolveThreshold('unknown', 1, global, [], tagMembership)).toBeNull();
  });

  it('prefers a tag override over the global threshold', () => {
    const overrides = [override('cpu', 'tag', 10, 50, 60)];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(overrides[0]);
  });

  it('prefers an instance override over both tag and global', () => {
    const overrides = [
      override('cpu', 'tag', 10, 50, 60),
      override('cpu', 'instance', 1, 30, 40),
    ];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(overrides[1]);
  });

  it('ignores overrides scoped to a tag the instance does not carry', () => {
    const overrides = [override('cpu', 'tag', 99, 5, 10)];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(global.cpu);
  });

  it('ignores overrides scoped to a different instance', () => {
    const overrides = [override('cpu', 'instance', 2, 5, 10)];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(global.cpu);
  });

  it('ignores overrides for a different metric', () => {
    const overrides = [override('io', 'instance', 1, 5, 10)];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(global.cpu);
  });

  it('takes the most sensitive tag override when several conflict', () => {
    // Instance 1 carries both tags; the lower critical must win so a breach is
    // never missed because a laxer tag happened to be listed first.
    const overrides = [
      override('cpu', 'tag', 10, 80, 95),
      override('cpu', 'tag', 11, 40, 55),
    ];

    expect(resolveThreshold('cpu', 1, global, overrides, tagMembership)).toEqual(overrides[1]);
  });

  it('applies the global threshold to an instance carrying no tags', () => {
    const overrides = [override('cpu', 'tag', 10, 50, 60)];

    expect(resolveThreshold('cpu', 2, global, overrides, tagMembership)).toEqual(global.cpu);
  });
});
