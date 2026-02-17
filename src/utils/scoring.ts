// =============================================
// CACHYER - SCORING & TIME-DECAY UTILITIES
// =============================================

/**
 * Calculate a weighted score from values and weights
 */
export function calculateWeightedScore(
  values: Record<string, number>,
  weights: Record<string, number>,
): number {
  let score = 0;
  for (const key of Object.keys(values)) {
    const value = values[key]!;
    const weight = weights[key] ?? 0;
    score += value * weight;
  }
  return score;
}

/**
 * Apply exponential time decay to a score
 *
 * @param score - Base score
 * @param hoursElapsed - Hours since the event
 * @param decayFactor - Controls decay speed (default: 0.1)
 * @returns Decayed score
 */
export function applyTimeDecay(
  score: number,
  hoursElapsed: number,
  decayFactor: number = 0.1,
): number {
  return score / (1 + hoursElapsed * decayFactor);
}

/**
 * Metrics input for hot score calculation
 */
export interface HotScoreMetrics {
  likes: number;
  comments: number;
  shares: number;
  views?: number;
}

/**
 * Calculate a hot/trending score
 *
 * @param metrics - Engagement metrics
 * @param minutesSinceActivity - Minutes since last activity (default: 0)
 * @returns Hot score value
 */
export function calculateHotScore(
  metrics: HotScoreMetrics,
  minutesSinceActivity: number = 0,
): number {
  const activityScore =
    metrics.likes * 2 +
    metrics.comments * 3 +
    metrics.shares * 5 +
    (metrics.views ?? 0) * 0.1;

  const decay = 1 / (1 + minutesSinceActivity * 0.05);

  return activityScore * decay;
}
