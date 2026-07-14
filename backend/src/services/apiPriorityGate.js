/**
 * Cooperative priority gate for the shared RapidAPI key.
 *
 * There is only one RapidAPI credential configured for this app (X,
 * Facebook and Instagram all point at the same key/plan), and it's shared
 * by three independent consumers: the grievance auto-fetch scheduler, the
 * X/Facebook/Instagram source monitor loop, and Frequent Engagers analysis.
 * The first two are large background batch jobs (hundreds of sequential
 * calls per cycle); the third is user-triggered and waited on interactively.
 *
 * Rather than requiring a second API key to truly isolate traffic, the
 * background loops cooperatively pause between iterations while an
 * interactive analysis is in flight, so it isn't queued behind a batch job's
 * backlog and doesn't collide with it on the plan's per-second rate limit.
 * Nothing is cancelled or loses progress — the batch loop just waits.
 */
let activeCount = 0;

const beginInteractivePriority = () => { activeCount += 1; };

const endInteractivePriority = () => { activeCount = Math.max(0, activeCount - 1); };

const isInteractivePriorityActive = () => activeCount > 0;

/** Call between iterations of a background batch loop. Resolves immediately when no interactive work is active. */
const yieldToInteractive = async () => {
  while (activeCount > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

module.exports = {
  beginInteractivePriority,
  endInteractivePriority,
  isInteractivePriorityActive,
  yieldToInteractive
};
