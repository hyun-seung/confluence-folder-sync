# Read efficiency and bounded retries — 0.7.0

[한국어 요약](#한국어-요약) · [Test guide](README.md)

The benchmark runs the real automatic-check code against an in-memory HTTP adapter. It uses 1,000 unchanged linked notes in 110 nested folders, paginated descendant responses, and tracked empty attachment inventories. Each synthetic HTTP response incurs a 1ms timer; there is no connection to Atlassian or a personal vault. Setup and initial baseline hashing are outside the timer; the automatic check's own preparation is included.

Measured on 2026-11-26 with Node.js 26:

| Measurement | 0.6.3 | 0.7.0 |
| --- | ---: | ---: |
| Total HTTP calls | 3,162 | 1,162 |
| Individual page metadata | 1,000 | 0 |
| Bulk page requests (25 IDs each) | 40 | 40 |
| Attachment lists | 2,000 | 1,000 |
| Folder detail requests | 110 | 110 |
| Paginated descendant requests | 12 | 12 |
| Remote writes | 0 | 0 |
| Peak concurrent HTTP requests | 4 | 4 |
| Illustrative elapsed milliseconds | 3,167 | 602 |

Call count falls by 63%. Timings include local scheduling, hashing and simulated latency, vary by machine/load, and do **not** predict live Confluence throughput. The comparison is a local fixture benchmark, not an Atlassian load test. A 1,000-note CI regression checks the call budget and absence of writes without timing thresholds.

Reproduce from the repository root:

```sh
npm ci --ignore-scripts --offline --no-audit --no-fund
npm test
git show 0.6.3:main.js > /tmp/cfs-baseline-0.6.3.js
node testing/benchmark.cjs /tmp/cfs-baseline-0.6.3.js 1000
npm run benchmark
```

Use an unused temporary filename for the baseline. `node testing/benchmark.cjs <bundle-path> <note-count>` accepts 1–10,000 notes. It loads only the supplied public bundle and synthetic fixtures.

## Boundaries

- A read view lasts for one review/check. Automatic local and remote comparisons share it; later commands create a new one. Responses are copied so consumers cannot mutate the cached baseline.
- Linked metadata is loaded 25 IDs at a time using the existing [v2 pages endpoint](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-get). A missing item conflicts its note; it does not make other review rows disappear. Write preflight and each Publisher operation still use fresh remote/local checks and independent write-state recovery.
- At most four REST API requests run per connection. This is not a global quota coordinator across devices or plugin instances. Binary import downloads remain sequential.
- GET retries are limited to four total attempts for 429, or 503 with a valid Retry-After. 429 without a valid header uses exponential backoff. Positive jitter is added; a valid server minimum is never shortened. Headers are read case-insensitively and seconds/HTTP-date values are supported.
- Each REST call has a 60-second deadline before a queued send or retry, including elapsed request/queue time before the next wait. Waking after the deadline fails without sending a late retry. Longer server delays return a localized retry-later message without an early retry. The cooldown is shared with queued calls on that connection; a later command starts a new connection.
- Cancellation/unloading is checked before queued requests and at most every 250ms while waiting. A request already sent through Obsidian requestUrl cannot be aborted. In-flight parallel readers drain before an aborted review returns.
- POST/PUT, attachments uploaded by POST, and unknown write responses are never automatically replayed. Existing pending-create/update/upload records continue to govern explicit recovery.
- Tests cover backoff, long/cumulative waits, shared cooldown, bounded concurrency, cancellation, missing bulk results, independent edits after a preview, and unchanged-note call counts. Existing source-scope, stale-edit, attachment/conflict and recovery tests remain required.

The retry policy follows [Atlassian's rate-limit guidance](https://developer.atlassian.com/cloud/confluence/rate-limiting/). Tests use synthetic responses rather than creating rate limits on a tenant.

## 한국어 요약

0.7.0은 연결된 페이지를 25개씩 묶어 읽고, 자동 확인 한 번 안에서 페이지·첨부 조회를 재사용합니다. 다음 확인에는 새 조회 기준을 만들며 발행 직전과 실제 쓰기 단계에서는 원격·로컬 상태를 새로 확인합니다.

합성 문서 1,000개·중첩 폴더 110개의 비교에서 호출은 **3,162 → 1,162회로 약 63% 감소**했습니다. 첨부 목록은 2,000 → 1,000회이며 원격 쓰기는 0회입니다. 1ms 가상 응답 지연에서 측정한 3,167 → 602ms는 로컬 예시이며 실제 Confluence 성능을 보장하지 않습니다.

연결당 REST 요청은 최대 4개입니다. GET만 최대 4회 시도하고 429 또는 유효한 Retry-After가 있는 503에 대기·재시도를 적용합니다. 서버가 지정한 최소 시간을 줄이지 않고 지수 대기와 임의 지연을 추가합니다. 누적 경과 시간을 포함한 60초 대기 한도를 넘기면 기다릴 시간을 안내하며 조기 재시도하지 않습니다. 취소는 대기 중 최대 250ms 간격으로 확인하지만 이미 보낸 요청은 중단할 수 없습니다.

POST·PUT·응답 불명 쓰기는 자동 재전송하지 않습니다. 기존 중단·완료 여부 확인을 통한 복구 절차를 유지합니다. 요청 제한은 연결 단위이며 여러 기기·설치의 한도를 함께 관리하지는 않습니다. 서버를 실제로 제한 상태로 만드는 시험이나 원본 업무 문서 변경은 수행하지 않았습니다.
