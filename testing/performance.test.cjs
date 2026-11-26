const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { runtime } = require("./runtime.cjs");
const { largeFixture } = require("./performance-fixture.cjs");
const { fixtureConfig } = require("./fixtures.cjs");
const lib = runtime();

function clock() {
  let time = 0;
  const sleeps = [];
  return { now: () => time, random: () => 0, sleeps,
    sleep: async ms => { sleeps.push(ms); time += ms; } };
}

function client(request, timing = clock()) {
  const instance = new lib.ConfluenceCloud(lib.validatedConfig(fixtureConfig), "synthetic", request, timing);
  instance.gateway = "https://api.atlassian.com/ex/confluence/12345678-1234-1234-1234-123456789012";
  instance.spaceId = "300";
  return instance;
}

test("Retry-After accepts case-insensitive seconds/HTTP-date and rejects malformed values", () => {
  assert.equal(lib.retryAfterMilliseconds({ "Retry-After": "45" }, 0), 45000);
  assert.equal(lib.retryAfterMilliseconds({ "RETRY-AFTER": "0" }, 0), 0);
  assert.equal(lib.retryAfterMilliseconds({ "Retry-After": "Thu, 01 Jan 1970 00:01:00 GMT" }, 10000), 50000);
  for (const value of ["", "oops", "-1", "Infinity", "NaN", "1e6"]) assert.equal(lib.retryAfterMilliseconds({ "retry-after": value }, 0), null);
});

test("GET retry respects a server delay longer than the old ten-second cap", async () => {
  const timing = clock();
  const starts = [];
  const api = client(async () => {
    starts.push(timing.now());
    return starts.length === 1 ? { status: 429, headers: { "Retry-After": "15" } } : { status: 200, json: {} };
  }, timing);
  await api.get("/wiki/api/v2/pages/201");
  assert.deepEqual(starts, [0, 15000]);
  assert.ok(timing.sleeps.every(ms => ms <= 250));
});

test("GET backoff grows and repeated throttling stops after four attempts", async () => {
  const timing = clock();
  const starts = [];
  const api = client(async () => { starts.push(timing.now()); return { status: 429, headers: {} }; }, timing);
  await assert.rejects(api.get("/wiki/api/v2/pages/201"), /HTTP 429/);
  assert.deepEqual(starts, [0, 1000, 3000, 7000]);
});

test("a long server cooldown fails promptly without early retry or a misleading waiting notice", async () => {
  const timing = clock();
  let requests = 0;
  let notices = 0;
  const api = client(async () => { requests++; return { status: 429, headers: { "Retry-After": "1847" } }; }, timing);
  api.onWait = () => notices++;
  await assert.rejects(api.get("/wiki/api/v2/pages/201"), error => {
    assert.match(lib.localizedError(error, "ko"), /1847초/);
    return true;
  });
  assert.equal(requests, 1);
  assert.equal(notices, 0);
  assert.deepEqual(timing.sleeps, []);
});

test("the elapsed retry budget stops repeated twenty-five-second waits", async () => {
  const timing = clock();
  const starts = [];
  const api = client(async () => { starts.push(timing.now()); return { status: 429, headers: { "retry-after": "25" } }; }, timing);
  await assert.rejects(api.get("/wiki/api/v2/pages/201"), /at least 25 seconds/);
  assert.deepEqual(starts, [0, 25000, 50000]);
});

test("a suspended app cannot retry after waking beyond the waiting deadline", async () => {
  const timing = clock();
  const starts = [];
  const api = client(async () => {
    starts.push(timing.now());
    return starts.length === 1 ? { status: 429, headers: { "Retry-After": "1" } } : { status: 200, json: {} };
  }, timing);
  api.requests.sleep = () => timing.sleep(70000);
  await assert.rejects(api.get("/wiki/api/v2/pages/201"), /waiting timed out/);
  assert.deepEqual(starts, [0]);
  assert.equal(api.requests.active, 0);
});

test("POST and PUT are never replayed for throttle, service failure or unknown response", async () => {
  for (const method of ["POST", "PUT"]) {
    for (const status of [429, 503, "unknown"]) {
      let requests = 0;
      const api = client(async () => {
        requests++;
        if (status === "unknown") throw new Error("Synthetic lost response");
        return { status, headers: { "Retry-After": "2" } };
      });
      await assert.rejects(api.call(method, "/wiki/api/v2/pages", { json: { title: "Synthetic" } }));
      assert.equal(requests, 1, method + " " + status);
    }
  }
});

test("503 retries only with Retry-After, and authorization failures stop immediately", async () => {
  for (const [status, headers, expected] of [[503, {}, 1], [403, {}, 1], [503, { "retry-after": "2" }, 2]]) {
    let requests = 0;
    const api = client(async () => ++requests === 1 ? { status, headers } : { status: 200, json: {} });
    if (expected === 2) await api.get("/wiki/api/v2/pages/201");
    else await assert.rejects(api.get("/wiki/api/v2/pages/201"));
    assert.equal(requests, expected);
  }
});

test("the connection never runs more than four API requests at once", async () => {
  let active = 0;
  let peak = 0;
  const api = client(async () => {
    active++;
    peak = Math.max(peak, active);
    await nextTurn();
    active--;
    return { status: 200, json: {} };
  });
  await Promise.all(Array.from({ length: 40 }, () => api.get("/wiki/api/v2/pages/201")));
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.equal(api.requests.active, 0);
  assert.equal(api.requests.queue.length, 0);
});

test("a shared cooldown delays queued requests and cancellation stops a waiting retry", async () => {
  const timing = clock();
  let cancelled = false;
  const starts = [];
  const api = client(async () => {
    starts.push(timing.now());
    return starts.length === 1 ? { status: 429, headers: { "Retry-After": "2" } } : { status: 200, json: {} };
  }, timing);
  api.requests.sleep = async ms => { await timing.sleep(ms); cancelled = true; };
  api.check = () => { if (cancelled) { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; } };
  await assert.rejects(api.get("/wiki/api/v2/pages/201"), { name: "AbortError" });
  assert.deepEqual(starts, [0]);
  api.check = undefined;
  api.requests.sleep = timing.sleep;
  await api.get("/wiki/api/v2/pages/202");
  assert.deepEqual(starts, [0, 2000]);
  assert.equal(api.requests.active, 0);
});

test("review reads coalesce attachment requests but isolate consumers and body/version variants", async () => {
  let attachments = 0;
  let pages = 0;
  const reads = new lib.ReviewReads({ config: {}, spaceId: "300",
    attachments: async () => { attachments++; await nextTurn(); return [{ title: "Synthetic" }]; },
    page: async () => { pages++; return { id: "201" }; } });
  const [first, second] = await Promise.all([reads.attachments("201"), reads.attachments("201")]);
  first[0].title = "Mutated";
  assert.equal(second[0].title, "Synthetic");
  assert.equal(attachments, 1);
  await reads.page("201"); await reads.page("201");
  await reads.page("201", undefined, true); await reads.page("201", 1, true);
  assert.equal(pages, 3);
});

test("a large automatic check batches metadata and reads each tracked attachment list once", async () => {
  const fixture = await largeFixture(lib, 100);
  await new lib.AutomaticSync(fixture.plugin).run();
  assert.match(fixture.plugin.automaticStatus, /0 conflicts, 0 remote changes, 0 published/);
  assert.equal(fixture.counters.individualPages, 0);
  assert.equal(fixture.counters.bulkPages, 4);
  assert.equal(fixture.counters.attachments, 100);
  assert.equal(fixture.counters.peak, 4);
  assert.equal(fixture.counters.writes, 0);
});

test("a subsequent automatic check reads fresh metadata and detects an independent edit", async () => {
  const fixture = await largeFixture(lib, 25);
  await new lib.AutomaticSync(fixture.plugin).run();
  fixture.records.get("20000").version.number++;
  await new lib.AutomaticSync(fixture.plugin).run();
  assert.match(fixture.plugin.automaticStatus, /1 conflicts, 1 remote changes, 0 published/);
  assert.equal(fixture.counters.bulkPages, 2);
  assert.equal(fixture.counters.writes, 0);
});

test("one thousand notes and deep catalog pagination stay within the read-call budget", async () => {
  const fixture = await largeFixture(lib, 1000);
  await new lib.AutomaticSync(fixture.plugin).run();
  assert.match(fixture.plugin.automaticStatus, /0 conflicts, 0 remote changes, 0 published/);
  assert.equal(Object.keys(fixture.profile.folders).length, 110);
  assert.equal(fixture.counters.descendants, 12);
  assert.equal(fixture.counters.attachments, 1000);
  assert.ok(fixture.counters.requests <= 1200);
  assert.equal(fixture.counters.writes, 0);
  assert.equal(fixture.counters.active, 0);
});

test("one missing bulk result conflicts only its note and leaves other review rows eligible", async () => {
  const fixture = await largeFixture(lib, 25);
  const catalog = await fixture.client.catalog();
  fixture.records.delete("20000");
  const review = await lib.publicationReview(fixture.app, fixture.client, fixture.profile, fixture.tree, catalog);
  assert.equal(review.rows.filter(row => row.status === "Conflict").length, 1);
  assert.equal(review.rows.filter(row => row.status === "Unchanged").length, 24);
  assert.equal(fixture.counters.individualPages, 0);
});

test("publication ignores earlier review caches and rejects a newer remote edit before any write", async () => {
  const fixture = await largeFixture(lib, 1);
  fixture.bodies.set(fixture.files[0].path, "Changed locally");
  const tree = await lib.preparedNotes(fixture.app, fixture.config);
  const review = await lib.publicationReview(fixture.app, fixture.client, fixture.profile, tree, await fixture.client.catalog());
  assert.equal(review.rows[0].status, "Changed");
  fixture.records.get("20000").version.number++;
  await assert.rejects(lib.publishSelection(fixture.app, fixture.client, fixture.profile, async () => {}, review, [fixture.files[0].path]), /changed/);
  assert.equal(fixture.counters.bulkPages, 2);
  assert.equal(fixture.counters.writes, 0);
});

test("publication cancellation during throttled preflight stops reads and restores its connection guard", async () => {
  const fixture = await largeFixture(lib, 1);
  fixture.bodies.set(fixture.files[0].path, "Changed locally");
  const review = await lib.publicationReview(fixture.app, fixture.client, fixture.profile,
    await lib.preparedNotes(fixture.app, fixture.config), await fixture.client.catalog());
  const previous = fixture.client.check;
  const request = fixture.client.request;
  let cancelled = false;
  let throttles = 0;
  fixture.client.request = async options => new URL(options.url).pathname.endsWith("/pages") ?
    (throttles++, { status: 429, headers: { "Retry-After": "2" } }) : request(options);
  fixture.client.requests.now = () => 0;
  fixture.client.requests.sleep = async () => { cancelled = true; };
  await assert.rejects(lib.publishSelection(fixture.app, fixture.client, fixture.profile, async () => {}, review,
    [fixture.files[0].path], { check: () => {
      if (cancelled) { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; }
    } }), { name: "AbortError" });
  assert.equal(throttles, 1);
  assert.equal(fixture.counters.writes, 0);
  assert.equal(fixture.client.check, previous);
  assert.equal(fixture.client.requests.active, 0);
});

test("an automatic attachment failure drains other in-flight readers before releasing its busy state", async () => {
  const fixture = await largeFixture(lib, 4);
  for (const entry of Object.values(fixture.profile.pages)) fixture.profile.imports[entry.id] = { ...entry };
  fixture.profile.pages = {};
  fixture.files.length = 0;
  let active = 0;
  let started = 0;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  fixture.client.attachments = async id => {
    started++;
    active++;
    try {
      if (id === "20000") { await nextTurn(); throw new Error("Synthetic attachment failure"); }
      await held;
      return [];
    } finally { active--; }
  };
  const automatic = new lib.AutomaticSync(fixture.plugin);
  let finished = false;
  const result = automatic.run().then(() => { finished = true; });
  const deadline = Date.now() + 2000;
  while (started < 4 && Date.now() < deadline) await nextTurn();
  assert.equal(started, 4);
  await nextTurn();
  assert.equal(active, 3);
  assert.equal(finished, false);
  assert.equal(automatic.busy, true);
  release();
  await result;
  assert.equal(active, 0);
  assert.equal(automatic.busy, false);
  assert.match(fixture.plugin.automaticStatus, /Synthetic attachment failure/);
});
