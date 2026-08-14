export type PublicationQueueItem = {
  id: number;
  completed_at: string | null;
  created_at: string;
};

export type ScheduledPublicationQueueItem = PublicationQueueItem & {
  scheduled_for: string | null;
};

function timestamp(value: string | null) {
  if (!value) return Number.NaN;
  return Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function oldestPreparedFirst<T extends PublicationQueueItem>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = timestamp(left.completed_at || left.created_at);
    const rightTime = timestamp(right.completed_at || right.created_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id - right.id;
  });
}

export function nextPublicationStart(
  nowMs: number,
  intervalMinutes: number,
  references: Array<string | null>,
) {
  const intervalMs = intervalMinutes * 60 * 1000;
  const latestReference = references
    .map(timestamp)
    .filter(Number.isFinite)
    .reduce((latest, value) => Number.isFinite(latest) ? Math.max(latest, value) : value, Number.NaN);
  return Number.isFinite(latestReference)
    ? Math.max(nowMs, latestReference + intervalMs)
    : nowMs;
}

export function buildPublicationSchedule<T extends PublicationQueueItem>(
  items: T[],
  firstSlotMs: number,
  intervalMinutes: number,
) {
  const intervalMs = intervalMinutes * 60 * 1000;
  return oldestPreparedFirst(items).map((item, index) => ({
    id: item.id,
    scheduledAtMs: firstSlotMs + index * intervalMs,
  }));
}

export function publicationScheduleNeedsRepair(
  items: ScheduledPublicationQueueItem[],
  intervalMinutes: number,
) {
  const intervalMs = intervalMinutes * 60 * 1000;
  let previousSlot = Number.NaN;
  for (const item of oldestPreparedFirst(items)) {
    const currentSlot = timestamp(item.scheduled_for);
    if (!Number.isFinite(currentSlot)) return true;
    if (Number.isFinite(previousSlot) && currentSlot - previousSlot < intervalMs) return true;
    previousSlot = currentSlot;
  }
  return false;
}
