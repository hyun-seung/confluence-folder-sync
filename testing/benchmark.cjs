const { performance } = require("node:perf_hooks");
const { runtime } = require("./runtime.cjs");
const { largeFixture } = require("./performance-fixture.cjs");

(async () => {
  const source = process.argv[2];
  const count = Number(process.argv[3] ?? 1000);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error("Use between 1 and 10000 synthetic notes.");
  const lib = runtime(source);
  const fixture = await largeFixture(lib, count, 1);
  const started = performance.now();
  await new lib.AutomaticSync(fixture.plugin).run();
  if (!fixture.plugin.automaticStatus.includes("0 conflicts, 0 remote changes, 0 published")) throw new Error(fixture.plugin.automaticStatus);
  console.log(JSON.stringify({ synthetic: true, remote: "in-memory HTTP responses with 1ms simulated latency", notes: count,
    folders: Object.keys(fixture.profile.folders).length, elapsedMs: Math.round(performance.now() - started), ...fixture.counters }));
})().catch(error => { console.error(error); process.exitCode = 1; });
