const REQUEST_CONCURRENCY = 4;
const RETRY_WAIT_BUDGET = 60_000;

async function mapConcurrent(items, visit, limit = REQUEST_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  let failure;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await visit(items[index], index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return results;
}

function retryAfterMilliseconds(headers, now) {
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (!/^[A-Za-z]{3}, /.test(text)) return null;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

class RetryWaitError extends SyncError {
  constructor(milliseconds) {
    super("Confluence is temporarily limiting requests. Retry this command in at least {seconds} seconds.",
      { seconds: Math.ceil(milliseconds / 1000) });
  }
}

class RequestQueue {
  constructor(timing = {}) {
    this.now = timing.now ?? Date.now;
    this.sleep = timing.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.active = 0;
    this.queue = [];
    this.blockedUntil = 0;
  }

  defer(milliseconds) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + milliseconds);
  }

  drain() {
    while (this.active < REQUEST_CONCURRENCY && this.queue.length) {
      this.active++;
      this.queue.shift()();
    }
  }

  async run(task, check, deadline) {
    await new Promise(resolve => { this.queue.push(resolve); this.drain(); });
    try {
      for (;;) {
        await check?.();
        if (this.now() >= deadline) throw new SyncError("Confluence request waiting timed out. Run the command again.");
        const remaining = this.blockedUntil - this.now();
        if (remaining <= 0) break;
        if (this.now() + remaining > deadline) throw new RetryWaitError(remaining);
        // Poll cancellation during backoff; never shorten the server's requested delay.
        await this.sleep(Math.min(250, remaining));
      }
      await check?.();
      return await task();
    } finally {
      this.active--;
      this.drain();
    }
  }
}
