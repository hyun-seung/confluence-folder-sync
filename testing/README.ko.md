# 재현 가능한 UI·데스크톱 시험

[English](README.md) · 한국어

합성 문서·식별자·원격 응답만 사용합니다. 개인 보관함이나 실제 플러그인의 `data.json`을 이 디렉터리에 복사하지 마세요. 브라우저 시험 의존성과 lockfile은 이곳에 분리합니다. 루트 빌드 의존성은 별도로 고정하며 Markdown·Mermaid를 제품 실행 파일에 번들합니다. 실행 중 패키지 다운로드는 없습니다.

저장소 루트에서 Node.js 26으로 실행합니다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm ci --ignore-scripts --prefix testing --no-audit --no-fund
npm test --prefix testing
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

루트 빌드·별도 시험 의존성 설치는 npm 레지스트리에 접근합니다. 설치 스크립트는 실행하지 않습니다. 소스를 바꾼 뒤 UI·네이티브 시험만 단독 실행한다면 먼저 `npm run build`를 실행하세요.

## Chromium 합성 UI

Chrome/Chromium을 설치하거나 `CHROME_PATH`에 실행 파일을 지정합니다. `puppeteer-core`가 브라우저를 내려받지는 않습니다. 실행기가 운영체제별 설치 경로를 찾고 없으면 실패합니다. 임시 Chrome 프로필에서 외부 페이지 요청을 차단한 뒤 실제 실행 파일·CSS를 불러옵니다.

영문·한글 × 1280px·390px의 네 조합으로 선택 발행, 버전 차이, 선택 반영·백업, 충돌 해결·복원, 첨부 가져오기, 재연결·취소·복구·발행 폴더 이전을 확인합니다. Chromium DOM은 실제이며 Obsidian UI와 보관함·Confluence는 합성입니다. 페이지 오류는 실패로 처리합니다. 좁은 화면 시험은 데스크톱 창의 반응형 배치 검증이며 모바일 Obsidian 지원을 뜻하지 않습니다.

## 실제 Obsidian 합성 시험

`OBSIDIAN_EXECUTABLE`에 설치된 Obsidian 데스크톱 실행 파일을 지정한 뒤 실행합니다.

```sh
npm run test:native --prefix testing
```

항상 새 임시 사용자 프로필과 보관함을 만들고, 제품 실행 파일을 그대로 설치합니다. API 접근용 시험 플러그인은 임시 보관함에만 넣으며 배포하지 않습니다. [Puppeteer CDP](https://pptr.dev/api/puppeteer.puppeteer.connect)로 해당 앱에 연결하고 실제 보관함 경로가 시험 경로인지 확인한 뒤 합성 보관함의 신뢰 안내를 수락합니다. 다른 보관함이면 시험을 거절하고 연결만 해제하며 그 앱을 닫지 않습니다. 시험용 앱 종료 후 임시 자료를 제거합니다.

실제 Plugin·Modal·Setting·Vault·SecretStorage와 이동 이벤트를 사용합니다. 영문·한글 화면, 선택한 로컬 변경 반영, 백업 내용과 복원, 바이너리 첨부 바이트, 이동 시 페이지 ID 유지, 플러그인 재로딩 후 상태·비밀 읽기를 확인합니다. Confluence 응답과 사용자 확인은 합성입니다. SecretStorage 검증은 API 읽기·쓰기이며 OS 키체인의 보안 보장, 앱을 완전히 재시작한 후 비밀 보존, 실제 Atlassian 인증을 검증한 것은 아닙니다.

CI는 [공식 Obsidian 1.14.5 배포](https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.14.5)의 SHA256을 고정합니다. Windows는 검증한 설치 파일에서 7-Zip으로 x64 앱만 추출하고, Linux는 공식 tarball을 추출해 Xvfb에서 실행합니다. Windows 설치 프로그램 UI·코드 서명과 모든 Linux 창 관리자·키링 조합은 범위 밖입니다. `--no-sandbox`는 비밀이나 실제 문서가 없는 일회용 Linux CI에서만 사용합니다. 다운로드 스크립트는 GitHub Actions 밖에서 실행을 거절하며 로컬 시험은 직접 지정한 앱을 사용합니다.

push·PR마다 세 운영체제의 Node·Chromium 시험과 Windows·Linux의 실제 Obsidian 시험을 실행합니다. 태그 배포도 같은 검사를 기다립니다. 실행 버전은 로그에 남기며 네이티브 시험을 실행하지 못하거나 실패하면 CI도 실패합니다.

## 이전 0.6.3 기준 확인 결과 — 2026-11-26

커밋 `db03cf22fea4fee605c55d0a236d0dcb50ffe8f1`의 [CI 45769956255](https://github.com/hyun-seung/confluence-folder-sync/actions/runs/45769956255)에서 9개 작업이 모두 통과했습니다.

| 검사 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Node 60개 | 통과 | 통과 | 통과 |
| Chromium 영문·한글 × 두 화면 크기 | 통과 | 통과 | 통과 |
| 실제 Obsidian 1.14.5 영문·한글 | 로컬 통과 | CI 통과 | CI 통과 |

패키징 작업도 Python 12개 시험과 배포 검사에 통과했습니다. 네이티브 로그에서 API 버전 `1.14.5`와 비밀 읽기·쓰기, 선택 반영·복원, 바이너리 가져오기, 이동 이벤트와 플러그인 재로딩의 성공을 확인했습니다. macOS는 설치된 공식 앱을 임시 프로필로 따로 실행했습니다. 이 확인 시점에는 개발 시험 인프라만 바꿨으며 제품 배포는 0.6.3이었습니다.

0.7.0은 제한된 재시도·취소와 1,000개 문서의 조회 예산 검사를 포함해 Node 시험을 78개로 확장합니다. 합성 측정과 재현 방법은 [성능 시험 안내](PERFORMANCE.md)에 정리합니다.

0.8.0은 Node 96개 시험과 두 언어의 브라우저·네이티브 설정 마법사 시험을 제공합니다. 초안 취소·읽기 전용 검사·실제 Obsidian SecretComponent·진단 비식별화·명시적 저장·토큰/설정/폴더 변경·검사 만료·저장 중 닫힘 복구를 검증합니다. 네이티브 원격 응답은 합성이며 사용자 클립보드는 변경하지 않습니다.

0.9.1에는 Node 시험 119개와 브라우저·실제 앱의 공통 Markdown 왕복 시험을 추가합니다. 로컬 Mermaid PNG·동일 PC의 반복 결과·위험 문법 거절·부모/Node 격리와 이미지/소스 가져오기를 확인하고 브라우저에서 외부 요청 0회를 검사합니다. 업로드·응답 유실 복구는 합성 원격으로 시험하며 동기 레이아웃 강제 중단·PC 간 이미지 일치를 보장하지 않습니다.
