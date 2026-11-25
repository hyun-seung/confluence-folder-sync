"use strict";

// English messages are stable translation keys. Interpolate values only after lookup.
const KOREAN = {
  "Resolve text conflict": "본문 충돌 해결",
  "Resolve page moves or title changes before resolving text.": "본문 충돌을 해결하기 전에 페이지 위치와 제목 변경을 확인하세요.",
  "The Confluence page changed. Review the conflict again.": "Confluence 페이지가 변경되었습니다. 충돌 내용을 다시 검토하세요.",
  "Review converted text. Attachments stay in Confluence. Publishing the resolution is a separate action.": "변환된 본문을 검토합니다. 첨부파일은 Confluence에 유지되며 해결한 내용의 발행은 별도로 실행합니다.",
  "Previous baseline": "이전 기준 본문",
  "Current local note": "현재 로컬 본문",
  "Current Confluence page": "현재 Confluence 본문",
  "Resolution text": "반영할 본문",
  "Use local text": "로컬 본문 사용",
  "Use Confluence text": "Confluence 본문 사용",
  "Save resolution locally": "해결한 본문을 로컬에 저장",
  "Back up {path}, save the reviewed text, and accept Confluence v{version} as the new baseline?": "{path}를 백업하고 검토한 본문을 저장하며 Confluence v{version}을 새 비교 기준으로 수용할까요?",
  "Resolution saved. Review publication to upload your chosen text.": "충돌 해결 내용을 저장했습니다. 발행 검토에서 선택한 본문을 업로드할 수 있습니다.",
  "Conflict resolution": "충돌 해결",
  "Loading conflict versions…": "충돌 비교를 위한 버전을 불러오는 중…",
  "Review publication": "발행할 문서 검토",
  "Changed": "수정",
  "Unchanged": "변경 없음",
  "Conflict": "충돌",
  "Select eligible notes": "발행 가능한 문서 선택",
  "Clear selection": "선택 해제",
  "Refresh review": "검토 목록 새로고침",
  "Filter notes": "문서 검색",
  "Selected notes: {count}": "선택한 문서 {count}개",
  "Publish selected": "선택한 문서 발행",
  "Also required: {paths}": "함께 선택할 새 링크 대상 — {paths}",
  "Publish {count} selected notes to {destination}?": "선택한 문서 {count}개를 {destination}에 발행할까요?",
  "Published {count} selected notes.": "선택한 문서 {count}개를 발행했습니다.",
  "The publication destination changed. Refresh the review.": "발행 대상이 변경되었습니다. 검토 목록을 새로고침하세요.",
  "Select at least one eligible note.": "발행할 수 있는 문서를 하나 이상 선택하세요.",
  "A selected note or page changed. Refresh the publication review.": "선택한 로컬 문서나 Confluence 페이지가 변경되었습니다. 발행 검토 목록을 새로고침하세요.",
  "Also select the unpublished notes referenced by your selection.": "선택한 문서가 참조하는 미발행 노트도 함께 선택하세요.",
  "Language": "언어",
  "Follow Obsidian or choose the language for this plugin.": "Obsidian 언어를 따르거나 플러그인에서 사용할 언어를 선택합니다.",
  "Follow Obsidian": "Obsidian 설정 따르기",
  "Cancel": "취소",
  "Confluence folder URL": "Confluence 폴더 URL",
  "Copy the URL of a folder from the Confluence sidebar.": "Confluence 사이드바에서 대상 폴더의 URL을 복사해 입력합니다.",
  "Atlassian email": "Atlassian 이메일",
  "Use the account that issued the Confluence Cloud token.": "Confluence Cloud 토큰을 발급한 계정의 이메일을 입력합니다.",
  "Confluence API token": "Confluence API 토큰",
  "Select a scoped Atlassian API token stored in Obsidian.": "Obsidian에 저장한 범위 지정 Atlassian API 토큰을 선택합니다.",
  "Source vault folder": "발행할 보관함 폴더",
  "Publish only notes and referenced files from this folder.": "이 폴더 안의 노트와 참조된 첨부파일을 발행합니다.",
  "Import vault folder": "가져오기 보관함 폴더",
  "Save previews and imported copies in a separate folder.": "변경 보고서와 가져온 사본을 저장할 별도 폴더입니다.",
  "Enable publish": "발행 허용",
  "Allow explicit, confirmed uploads from this vault.": "사용자가 실행하고 확인한 경우 이 보관함의 문서를 업로드합니다.",
  "Connection": "연결",
  "Test connection": "연결 테스트",
  "Open Confluence sync dashboard": "Confluence 동기화 대시보드 열기",
  "Open sync dashboard": "동기화 대시보드 열기",
  "Publish vault folder to Confluence": "보관함 폴더를 Confluence에 발행",
  "Preview Confluence changes": "Confluence 변경 사항 미리 보기",
  "Import new Confluence pages": "Confluence 새 페이지 가져오기",
  "Confluence Folder Sync could not save the settings.": "Confluence Folder Sync 설정을 저장하지 못했습니다.",
  "Connecting to Confluence…": "Confluence에 연결하는 중…",
  "Connected to Confluence folder {title} ({id}).": "Confluence 폴더 {title} ({id})에 연결했습니다.",
  "Publish to Confluence": "Confluence에 발행",
  "Publish {count} notes from {source} to {host} / {folder} (folder {id}).": "{source}의 노트 {count}개를 {host} / {folder} (폴더 {id})에 발행합니다.",
  "Publish": "발행",
  "Publishing to Confluence…": "Confluence에 발행하는 중…",
  "Confluence: {updated} updated, {unchanged} unchanged.": "Confluence 문서 {updated}개 반영, {unchanged}개 변경 없음.",
  "Load pages to view their Confluence versions.": "페이지 목록을 불러와 Confluence 버전을 확인하세요.",
  "Check and sync": "변경 확인 및 동기화",
  "Preview changes": "변경 사항 미리 보기",
  "Import new pages": "새 페이지 가져오기",
  "Publish folder": "폴더 발행",
  "Download the full folder": "전체 폴더 내려받기",
  "Save every current page as a new snapshot under the import folder.": "모든 페이지의 현재 버전을 가져오기 폴더 안에 새 사본으로 저장합니다.",
  "Download snapshot": "전체 사본 내려받기",
  "Page versions": "페이지 버전",
  "Load pages": "페이지 목록 불러오기",
  "Confluence page": "Confluence 페이지",
  "Filter pages": "페이지 검색",
  "Title or folder": "제목 또는 폴더",
  "Selected page": "선택한 페이지",
  "Load versions": "버전 불러오기",
  "Review local application": "로컬 반영 검토",
  "Download latest copy": "최신 사본 내려받기",
  "Compare versions": "버전 비교",
  "Base version": "기준 버전",
  "Comparison version": "비교 버전",
  "Compare": "비교",
  "Version differences": "버전 차이",
  "Apply selected changes to {path}": "{path}에 선택한 변경 반영",
  "Change {number}": "변경 {number}",
  "The local context is missing or ambiguous.": "로컬에서 일치하는 위치를 찾을 수 없거나 여러 곳이 일치합니다.",
  "Local line {number}": "로컬 {number}번째 줄",
  "Apply selected changes": "선택한 변경 반영",
  "Backup saved": "백업 저장됨",
  "Open backup": "백업 열기",
  "Choose a page": "페이지 선택",
  "Loading Confluence pages…": "Confluence 페이지를 불러오는 중…",
  "{folder} · {count} pages": "{folder} · 페이지 {count}개",
  "Loading page versions…": "페이지 버전을 불러오는 중…",
  "{title} · {count} available versions": "{title} · 확인 가능한 버전 {count}개",
  "Comparing page versions…": "페이지 버전을 비교하는 중…",
  "No converted Markdown body difference.": "Markdown으로 변환한 본문에 차이가 없습니다.",
  "Version comparison complete.": "버전 비교를 완료했습니다.",
  "Finding changes that match the local note…": "로컬 노트에 반영할 수 있는 변경을 확인하는 중…",
  "{available} of {total} changes match the local note.": "변경 {total}개 중 {available}개를 로컬 노트에 반영할 수 있습니다.",
  "No incoming body changes.": "가져올 본문 변경이 없습니다.",
  "Checking the selected changes…": "선택한 변경을 확인하는 중…",
  "Apply {count} changes to {path}? A backup will be saved first.": "{path}에 변경 {count}개를 반영할까요? 먼저 백업을 저장합니다.",
  "Apply changes": "변경 반영",
  "Application cancelled.": "로컬 반영을 취소했습니다.",
  "{count} changes applied to the local note.": "로컬 노트에 변경 {count}개를 반영했습니다.",
  "Preparing the current Confluence snapshot…": "Confluence의 현재 버전 사본을 준비하는 중…",
  "Download Confluence snapshot": "Confluence 전체 사본 내려받기",
  "Save the current versions of {count} pages from {folder} in a new snapshot under {inbox}?": "{folder}의 페이지 {count}개를 {inbox} 아래 새 사본 폴더에 저장할까요?",
  "Snapshot cancelled.": "전체 사본 내려받기를 취소했습니다.",
  "{count} current copies saved": "현재 버전 사본 {count}개 저장됨",
  "Confluence snapshot": "Confluence 전체 사본",
  "New": "신규",
  "Confluence version {before} → {after}": "Confluence 버전 {before} → {after}",
  "Local path: {path}": "로컬 경로 — {path}",
  "Both the local note and the Confluence page changed.": "로컬 노트와 Confluence 페이지가 모두 변경되었습니다.",
  "The Confluence parent changed.": "Confluence의 상위 항목이 변경되었습니다.",
  "The Confluence title changed.": "Confluence 제목이 변경되었습니다.",
  "Attachment added": "첨부파일 추가",
  "Attachment changed": "첨부파일 변경",
  "Attachment removed": "첨부파일 삭제",
  "The previous version cannot be read.": "이전 버전을 읽을 수 없습니다.",
  "Current local text compared with Confluence:": "현재 로컬 본문과 Confluence 비교",
  "Outside the selected hierarchy or unavailable": "선택한 계층 밖으로 이동했거나 접근할 수 없음",
  "{new} new · {changed} changed · {imported} imported · {missing} unavailable": "신규 {new}개 · 변경 {changed}개 · 가져옴 {imported}개 · 접근 불가 {missing}개",
  "Confluence import report": "Confluence 가져오기 보고서",
  "Confluence change preview": "Confluence 변경 사항 미리 보기",
  "New pages and their attachments are saved under Imported pages.": "새 페이지와 첨부파일을 Imported pages 아래에 저장했습니다.",
  "Review the differences and copy the changes you want to incorporate into the original note.": "차이를 검토해 필요한 내용을 원본 노트에 반영하세요. 대시보드의 로컬 반영 검토에서 변경을 선택할 수 있습니다.",
  "Recorded current attachment versions for {count} previously tracked pages.": "기존 추적 페이지 {count}개의 현재 첨부파일 버전을 기록했습니다.",
  "A Confluence command is already running in this vault.": "이 보관함에서 다른 Confluence 명령을 실행 중입니다.",
  "Choose a valid token in the plugin settings.": "플러그인 설정에서 유효한 토큰을 선택하세요.",
  "Enable publishing in the plugin settings first.": "먼저 플러그인 설정에서 발행을 허용하세요.",
  "The selected folder contains no Markdown notes.": "선택한 폴더에 Markdown 노트가 없습니다.",
  "The operation failed.": "작업에 실패했습니다.",
  "The Confluence action failed.": "Confluence 작업에 실패했습니다.",
  "The selected page is no longer in this Confluence folder.": "선택한 페이지가 더 이상 이 Confluence 폴더 안에 없습니다.",
  "Choose two different versions.": "서로 다른 버전 두 개를 선택하세요.",
  "The selected folder contains no pages.": "선택한 폴더에 페이지가 없습니다.",
  "Confluence returned an invalid content ID.": "Confluence가 잘못된 콘텐츠 ID를 반환했습니다.",
  "Use a visible, relative vault folder path.": "숨김 폴더가 아닌 보관함 기준 상대 폴더 경로를 입력하세요.",
  "Enter a Confluence Cloud folder URL.": "Confluence Cloud 폴더 URL을 입력하세요.",
  "Enter the HTTPS URL of a Confluence Cloud folder.": "Confluence Cloud 폴더의 HTTPS URL을 입력하세요.",
  "Choose separate source and import folders that do not overlap.": "발행 폴더와 가져오기 폴더를 서로 겹치지 않게 지정하세요.",
  "Set an Atlassian email and select a token in the plugin settings.": "플러그인 설정에서 Atlassian 이메일을 입력하고 토큰을 선택하세요.",
  "Confluence returned invalid attachment metadata.": "Confluence가 잘못된 첨부파일 정보를 반환했습니다.",
  "Confluence returned duplicate attachment IDs.": "Confluence가 중복된 첨부파일 ID를 반환했습니다.",
  "Could not read the Confluence attachment over HTTPS.": "HTTPS로 Confluence 첨부파일을 읽지 못했습니다.",
  "Attachment exceeded the size reported by Confluence.": "첨부파일이 Confluence에서 보고한 크기를 초과했습니다.",
  "Attachment size did not match the Confluence metadata.": "첨부파일 크기가 Confluence 정보와 일치하지 않습니다.",
  "Confluence attachment download timed out.": "Confluence 첨부파일 내려받기 시간이 초과되었습니다.",
  "The Confluence site did not return a Cloud ID.": "Confluence 사이트가 Cloud ID를 반환하지 않았습니다.",
  "The configured Confluence folder is unavailable.": "설정한 Confluence 폴더에 접근할 수 없습니다.",
  "Refusing a request outside the Confluence API.": "Confluence API 범위 밖의 요청을 차단했습니다.",
  "Confluence returned an invalid list.": "Confluence가 잘못된 목록을 반환했습니다.",
  "Confluence returned an unexpected pagination host.": "Confluence 목록의 다음 페이지 호스트가 허용 범위 밖입니다.",
  "Confluence returned an unexpected pagination cursor.": "Confluence 목록의 다음 페이지 커서가 올바르지 않습니다.",
  "Confluence returned a repeated folder ID.": "Confluence 계층에서 폴더 ID가 반복되었습니다.",
  "Confluence returned a page outside the requested scope.": "Confluence가 요청 범위 밖의 페이지를 반환했습니다.",
  "A page changed location or became inaccessible. Run the command again.": "페이지 위치가 변경되었거나 접근할 수 없습니다. 명령을 다시 실행하세요.",
  "Confluence returned an unexpected attachment download host.": "첨부파일 다운로드 호스트가 허용 범위 밖입니다.",
  "Confluence returned a truncated attachment.": "Confluence가 불완전한 첨부파일을 반환했습니다.",
  "The selected source folder does not exist in this vault.": "선택한 발행 폴더가 이 보관함에 없습니다.",
  "Confluence did not confirm the expected update.": "Confluence에서 예상한 업데이트를 확인하지 못했습니다.",
  "Confluence returned a cyclic parent hierarchy.": "Confluence의 상위 계층이 순환합니다.",
  "A page changed during this run. Run the command again.": "실행 중 페이지가 변경되었습니다. 명령을 다시 실행하세요.",
  "Confluence did not return the page's storage body.": "Confluence가 페이지의 storage 본문을 반환하지 않았습니다.",
  "The import path is outside the configured import folder.": "저장 경로가 설정한 가져오기 폴더 밖입니다.",
  "Confluence returned duplicate attachment names.": "Confluence가 중복된 첨부파일 이름을 반환했습니다.",
  "A page moved during this run. Run the command again.": "실행 중 페이지가 이동했습니다. 명령을 다시 실행하세요.",
  "The selected page is unavailable in this folder.": "이 폴더에서 선택한 페이지에 접근할 수 없습니다.",
  "This comparison is too large for selective application. Use the regular preview.": "선택 반영으로 처리하기에는 변경이 너무 큽니다. 변경 사항 미리 보기를 사용하세요.",
  "The comparison could not be split into changes.": "비교 결과를 개별 변경으로 나누지 못했습니다.",
  "This note has mixed line endings. Apply the changes manually.": "노트의 줄바꿈 형식이 섞여 있습니다. 변경을 수동으로 반영하세요.",
  "The selected changes overlap or no longer match the note.": "선택한 변경이 겹치거나 현재 노트와 일치하지 않습니다.",
  "This page is not linked to one published note in the active source folder.": "이 페이지가 현재 발행 폴더의 노트 하나에 연결되어 있지 않습니다.",
  "The link has an unfinished publish. Resolve it before reviewing edits.": "연결된 페이지의 이전 발행이 완료되지 않았습니다. 먼저 발행 상태를 확인하세요.",
  "The Confluence page or destination changed. Review the latest version again.": "Confluence 페이지 또는 대상이 변경되었습니다. 최신 버전을 다시 검토하세요.",
  "The Confluence page or its link changed. Review the latest version again.": "Confluence 페이지 또는 연결이 변경되었습니다. 최신 버전을 다시 검토하세요.",
  "Select at least one valid change.": "반영할 수 있는 변경을 하나 이상 선택하세요.",
  "The selected changes would not modify the note.": "선택한 변경을 적용해도 노트가 달라지지 않습니다.",
  "The local note changed after review. Review it again.": "검토 후 로컬 노트가 변경되었습니다. 다시 검토하세요.",
  "The Confluence page changed while preparing the backup. No local change was applied.": "백업 준비 중 Confluence 페이지가 변경되어 로컬 반영을 중단했습니다.",
  "The local note changed while applying the selection. No local change was applied.": "선택 반영 중 로컬 노트가 변경되어 반영을 중단했습니다.",
  "Confluence {method} returned HTTP {status}.": "Confluence {method} 요청에서 HTTP {status} 오류가 발생했습니다.",
  "Duplicate page title in the source folder: {title}": "발행 폴더 안에 중복된 페이지 제목이 있습니다 — {title}",
  "A source title exceeds the Confluence maximum: {title}": "Confluence 최대 길이를 초과하는 제목입니다 — {title}",
  "An attachment exceeds this plugin's 25 MiB limit: {name}": "첨부파일이 플러그인의 25 MiB 제한을 초과합니다 — {name}",
  "Confluence {kind} changed position, name or status: {title}": "Confluence 항목({kind})의 위치, 이름 또는 상태가 변경되었습니다 — {title}",
  "Confluence page has an independent edit: {title}. Run Preview Confluence changes.": "Confluence 페이지가 별도로 수정되었습니다 — {title}. 변경 사항 미리 보기를 실행하세요.",
  "A mapped item is outside the configured folder: {title}": "연결된 항목이 설정한 폴더 밖에 있습니다 — {title}",
  "The previous create result is unknown: {title}": "이전 생성 요청의 결과를 확인할 수 없습니다 — {title}",
  "An existing Confluence item is not linked to this source: {title}": "기존 Confluence 항목이 이 원본과 연결되어 있지 않습니다 — {title}",
  "An attachment name exists with different content: {title}": "같은 이름의 첨부파일이 다른 내용으로 존재합니다 — {title}",
  "A file occupies the import folder path: {path}": "가져오기 폴더 경로에 파일이 존재합니다 — {path}",
  "A Confluence attachment exceeds the 25 MiB limit for {title}.": "페이지 {title}의 Confluence 첨부파일이 25 MiB 제한을 초과합니다.",
  "An existing local attachment has different content: {name}": "기존 로컬 첨부파일의 내용이 다릅니다 — {name}",
  "An existing local file has different contents: {path}": "기존 로컬 파일의 내용이 다릅니다 — {path}",
  "Attachment exceeds the 25 MiB limit: {title}": "첨부파일이 25 MiB 제한을 초과합니다 — {title}",
  "The linked local Markdown file is unavailable: {path}": "연결된 로컬 Markdown 파일을 찾을 수 없습니다 — {path}",
  "Snapshot stopped after {count} copies. {reason} Check {path} for saved files.": "사본 {count}개 저장 후 중단되었습니다. {reason} 저장된 파일은 {path}에서 확인하세요.",
};

function syncLanguage(setting, appLanguage = "en") {
  const selected = setting === "en" || setting === "ko" ? setting : appLanguage;
  return /^ko(?:[-_]|$)/i.test(selected) ? "ko" : "en";
}

function translate(language, message, values = {}) {
  const template = language === "ko" && Object.hasOwn(KOREAN, message) ? KOREAN[message] : message;
  return template.replace(/\{([a-z]+)\}/gi, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
}

// Keep the English Error.message for diagnostics and tests; translate at the UI boundary.
class SyncError extends Error {
  constructor(template, values) {
    super(translate("en", template, values));
    this.template = template;
    this.values = values;
  }
}

function localizedError(error, language) {
  if (error instanceof SyncError) return translate(language, error.template, error.values);
  if (error instanceof ApiError) {
    return translate(language, "Confluence {method} returned HTTP {status}.", { method: error.method, status: error.status });
  }
  return translate(language, error instanceof Error ? error.message : "The operation failed.");
}

const { Plugin, PluginSettingTab, Setting, SecretComponent, Notice, Modal, requestUrl, getLanguage } = require("obsidian");

const DESCENDANTS_DEPTH = 10;
const API = "/wiki/api/v2";
const REST = "/wiki/rest/api";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

class ApiError extends Error {
  constructor(method, status) {
    super(`Confluence ${method} returned HTTP ${status}.`);
    this.status = status;
    this.method = method;
  }
}

function numericId(value) {
  const id = String(value);
  if (!/^[0-9]+$/.test(id)) throw new Error("Confluence returned an invalid content ID.");
  return id;
}

function normalized(value) {
  return value.normalize("NFC");
}

function pathIn(path, folder) {
  return path === folder || path.startsWith(folder + "/");
}

function vaultPath(input) {
  const parts = normalized(input.trim()).split("/");
  if (parts.some(part => !part || part.startsWith(".") || /[\\:\x00-\x1f]/.test(part))) {
    throw new Error("Use a visible, relative vault folder path.");
  }
  return parts.join("/");
}

function validatedConfig(settings) {
  let url;
  try {
    url = new URL(settings.folderUrl.trim());
  } catch {
    throw new Error("Enter a Confluence Cloud folder URL.");
  }
  const match = url.pathname.match(/^\/wiki\/spaces\/[~a-zA-Z0-9_-]+\/folder\/([0-9]+)(?:\/[^/]*)?\/?$/);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.atlassian\.net$/.test(url.host)
      || url.username || url.password || !match) {
    throw new Error("Enter the HTTPS URL of a Confluence Cloud folder.");
  }

  const source = vaultPath(settings.source);
  const inbox = vaultPath(settings.inbox);
  if (pathIn(source.toLowerCase(), inbox.toLowerCase()) || pathIn(inbox.toLowerCase(), source.toLowerCase())) {
    throw new Error("Choose separate source and import folders that do not overlap.");
  }
  const email = settings.email.trim();
  if (!/^[^\s:@]+@[^\s:@]+$/.test(email) || !settings.secretId) {
    throw new Error("Set an Atlassian email and select a token in the plugin settings.");
  }
  return { ...settings, origin: url.origin, folderId: match[1], source, inbox, email };
}

async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentEntry(file) {
  const id = String(file.id).replace(/^att/, "");
  const size = file.fileSize;
  const version = file.version?.number;
  if (!/^[0-9]+$/.test(id) || !Number.isSafeInteger(size) || size < 0 ||
      !Number.isInteger(version) || version < 1 || typeof file.title !== "string") {
    throw new Error("Confluence returned invalid attachment metadata.");
  }
  return { id, title: file.title, version, size };
}

function attachmentInventory(files) {
  const entries = files.map(attachmentEntry).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new Error("Confluence returned duplicate attachment IDs.");
  }
  return entries;
}

function attachmentDiff(before, after) {
  const prior = new Map(before.map(entry => [entry.id, entry]));
  const changes = [];
  for (const entry of after) {
    const old = prior.get(entry.id);
    if (!old) changes.push({ kind: "Added", title: entry.title, version: entry.version });
    else if (entry.version !== old.version || entry.title !== old.title || entry.size !== old.size) {
      changes.push({ kind: "Changed", title: entry.title, version: entry.version, before: old.version });
    }
    prior.delete(entry.id);
  }
  for (const entry of prior.values()) changes.push({ kind: "Removed", title: entry.title, version: entry.version });
  return changes;
}

function binaryGet(url, headers, expectedBytes) {
  // Node's desktop HTTPS client never follows redirects automatically.
  const { get } = require("node:https");
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Could not read the Confluence attachment over HTTPS."));
    const request = get(url, { headers, timeout: 30_000 }, response => {
      const status = response.statusCode;
      if (status !== 200 || expectedBytes === undefined) {
        response.destroy();
        resolve({ status, location: response.headers.location });
        return;
      }
      const bytes = new Uint8Array(expectedBytes);
      let read = 0;
      response.on("data", chunk => {
        if (read + chunk.length > bytes.length) {
          reject(new Error("Attachment exceeded the size reported by Confluence."));
          response.destroy();
          return;
        }
        bytes.set(chunk, read);
        read += chunk.length;
      });
      response.on("end", () => read === bytes.length ? resolve({ status, data: bytes.buffer }) :
        reject(new Error("Attachment size did not match the Confluence metadata.")));
      response.on("error", fail);
      response.on("aborted", fail);
    });
    request.on("error", fail);
    request.on("timeout", () => {
      reject(new Error("Confluence attachment download timed out."));
      request.destroy();
    });
  });
}

class ConfluenceCloud {
  constructor(config, token, request = requestUrl) {
    this.config = config;
    this.request = request;
    this.auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(config.email + ":" + token)));
  }

  async connect() {
    const response = await this.request({
      url: this.config.origin + "/_edge/tenant_info", method: "GET", throw: false,
    });
    if (response.status !== 200) throw new ApiError("tenant lookup", response.status);
    const id = response.json.cloudId;
    if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("The Confluence site did not return a Cloud ID.");
    }
    this.gateway = `https://api.atlassian.com/ex/confluence/${id}`;
    this.folder = await this.get(API + "/folders/" + this.config.folderId);
    if (numericId(this.folder.id) !== this.config.folderId || this.folder.status !== "current") {
      throw new Error("The configured Confluence folder is unavailable.");
    }
    this.spaceId = numericId(this.folder.spaceId);
    return this.folder;
  }

  async call(method, path, options = {}) {
    if (!path.startsWith(API + "/") && !path.startsWith(REST + "/")) {
      throw new Error("Refusing a request outside the Confluence API.");
    }
    const headers = { Accept: "application/json", Authorization: this.auth, ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    }
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await this.request({ url: this.gateway + path, method, headers, body, throw: false });
      if (method !== "GET" || (response.status !== 429 && response.status !== 503) || attempt === 2) break;
      const delay = Number(response.headers?.["retry-after"]) || 2;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.min(10, Math.max(1, delay))));
    }
    if (response.status < 200 || response.status >= 300) throw new ApiError(method, response.status);
    return response;
  }

  async get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) qs.append(key, item);
    }
    return (await this.call("GET", path + (qs.size ? "?" + qs : ""))).json;
  }

  async list(path, params) {
    const items = [];
    const visited = new Set();
    let current = await this.get(path, params);
    for (;;) {
      if (!Array.isArray(current.results)) throw new Error("Confluence returned an invalid list.");
      items.push(...current.results);
      if (!current._links?.next) return items;
      const next = new URL(current._links.next, this.gateway);
      if (next.origin !== new URL(this.gateway).origin && next.origin !== this.config.origin) {
        throw new Error("Confluence returned an unexpected pagination host.");
      }
      const endpoint = next.pathname.replace(/^\/ex\/confluence\/[a-f0-9-]+/i, "").replace(/^\/api\/v2\//, "/wiki/api/v2/");
      if (endpoint.replace(/\/$/, "") !== path.replace(/\/$/, "") || visited.has(next.search)) {
        throw new Error("Confluence returned an unexpected pagination cursor.");
      }
      visited.add(next.search);
      current = (await this.call("GET", endpoint + next.search)).json;
    }
  }

  async catalog() {
    const root = this.config.folderId;
    const roots = [{ id: root, kind: "folder" }];
    const queried = new Set();
    const entries = new Map();
    while (roots.length) {
      const { id, kind } = roots.pop();
      if (queried.has(id)) throw new Error("Confluence returned a repeated folder ID.");
      queried.add(id);
      const results = await this.list(API + `/${kind}s/${id}/descendants`, { limit: 100, depth: DESCENDANTS_DEPTH });
      for (const item of results) {
        const childId = numericId(item.id);
        entries.set(childId, item);
        if (item.depth === DESCENDANTS_DEPTH && (item.type === "folder" || item.type === "page")) {
          roots.push({ id: childId, kind: item.type });
        }
      }
    }
    return entries;
  }

  page(id, version, readBody = false) {
    const query = readBody ? { "body-format": "storage" } : {};
    if (version !== undefined) query.version = version;
    return this.get(API + "/pages/" + numericId(id), query);
  }

  pageVersions(id) {
    return this.list(API + "/pages/" + numericId(id) + "/versions", { limit: 50 });
  }

  async currentPages(ids) {
    const mapped = new Map();
    for (let i = 0; i < ids.length; i += 25) {
      const group = ids.slice(i, i + 25);
      const batch = await this.list(API + "/pages", { id: group, "space-id": this.spaceId, status: "current", limit: 100 });
      for (const page of batch) {
        const id = numericId(page.id);
        if (!group.includes(id) || String(page.spaceId) !== this.spaceId) {
          throw new Error("Confluence returned a page outside the requested scope.");
        }
        mapped.set(id, page);
      }
    }
    if (mapped.size !== ids.length) throw new Error("A page changed location or became inaccessible. Run the command again.");
    return mapped;
  }

  pageTitles(title) {
    return this.list(API + "/pages", { "space-id": this.spaceId, status: ["current", "archived"], title, limit: 100 });
  }

  async create(kind, title, parent, storage) {
    const json = { title, spaceId: this.spaceId, parentId: numericId(parent) };
    if (kind === "page") {
      json.status = "current";
      json.body = { representation: "storage", value: storage };
    }
    return (await this.call("POST", API + `/${kind}s`, { json })).json;
  }

  async update(page, body, message) {
    const id = numericId(page.id);
    const json = {
      id, title: page.title, status: "current",
      body: { representation: "storage", value: body },
      version: { number: page.version.number + 1, message, minorEdit: true },
    };
    return (await this.call("PUT", API + "/pages/" + id, { json })).json;
  }

  attachments(id) {
    return this.list(API + `/pages/${numericId(id)}/attachments`, { limit: 100 });
  }

  async downloadAttachment(pageId, file, get = binaryGet) {
    const entry = attachmentEntry(file);
    if (entry.size > MAX_ATTACHMENT_BYTES) throw new SyncError("Attachment exceeds the 25 MiB limit: {title}", { title: entry.title });
    const path = REST + "/content/" + numericId(pageId) + "/child/attachment/" +
      encodeURIComponent(file.id) + "/download?version=" + entry.version;
    const response = await get(this.gateway + path, { Authorization: this.auth });
    if (response.status !== 302 || typeof response.location !== "string") {
      throw new ApiError("attachment lookup", response.status);
    }
    const target = new URL(response.location);
    if (target.origin !== "https://api.media.atlassian.com" || target.username || target.password) {
      throw new Error("Confluence returned an unexpected attachment download host.");
    }
    const media = await get(target.href, {}, entry.size);
    if (media.status !== 200) throw new ApiError("attachment download", media.status);
    if (media.data?.byteLength !== entry.size) throw new Error("Confluence returned a truncated attachment.");
    return media.data;
  }

  async upload(id, asset) {
    const boundary = "confluence-folder-sync-" + crypto.randomUUID();
    const encode = new TextEncoder();
    const segments = [
      encode.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${asset.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      asset.data,
      encode.encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="minorEdit"\r\n\r\ntrue\r\n--${boundary}\r\nContent-Disposition: form-data; name="comment"\r\n\r\n${asset.hash}\r\n--${boundary}--\r\n`),
    ];
    const body = await new Blob(segments).arrayBuffer();
    await this.call("POST", REST + `/content/${numericId(id)}/child/attachment`, {
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "X-Atlassian-Token": "nocheck" },
      body,
    });
  }

  pageUrl(id) {
    return `${this.config.origin}/wiki/pages/viewpage.action?pageId=${numericId(id)}`;
  }
}

function xml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function webLink(value, origin) {
  try {
    const url = new URL(value, origin);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

function codeFence(text, language = "") {
  const character = String.fromCharCode(96);
  const longest = Math.max(2, ...(text.match(new RegExp(character + "+", "g")) ?? []).map(run => run.length));
  const marker = character.repeat(longest + 1);
  return marker + language + "\n" + text + "\n" + marker;
}

function storageCode(text, language) {
  const safeLanguage = /^[a-z0-9+_-]+$/i.test(language) ? language : "";
  return '<ac:structured-macro ac:name="code">' +
    (safeLanguage ? '<ac:parameter ac:name="language">' + xml(safeLanguage) + '</ac:parameter>' : "") +
    '<ac:plain-text-body><![CDATA[' + text.replace(/\]\]>/g, "]]]]><![CDATA[>") + ']]></ac:plain-text-body>' +
    '</ac:structured-macro>';
}

function tableCells(line) {
  const table = line.trim().replace(/^\||(?<!\\)\|$/g, "");
  const results = [];
  let start = 0;
  for (const token of table.matchAll(/\[\[[^\]\n]+\]\]|\x60+[^\x60]+\x60+|\\\||\|/g)) {
    if (token[0] !== "|") continue;
    results.push(table.slice(start, token.index));
    start = token.index + 1;
  }
  results.push(table.slice(start));
  return results.map(cell => cell.trim().replace(/\\\|/g, "|"));
}

const MARKDOWN_REF = /(!?)\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\(\s*(?:<([^<>\n]+)>|([^\s()]+))(?:\s+"[^"\n]*")?\s*\)/g;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

function referenceTarget(match) {
  if (match[2] !== undefined) {
    const [target, alias] = match[2].replace(/\\\|/g, "|").split("|", 2);
    return { embed: Boolean(match[1]), target: target.trim(), label: alias || target.trim() };
  }
  return { embed: Boolean(match[3]), target: match[5] ?? match[6], label: match[4] };
}

function textMarkup(value) {
  return xml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
}

function markdownLines(markdown, visitor) {
  const source = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
  const units = [];
  const fencePattern = /^\s{0,3}([~]{3,}|\x60{3,})(.*)$/;
  let fence;
  let code = [];
  for (const line of source.split("\n")) {
    const marker = fencePattern.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.mark[0] && marker[1].length >= fence.mark.length && !marker[2].trim()) {
        units.push({ code: code.join("\n"), language: fence.language });
        code = [];
        fence = null;
      } else {
        code.push(line);
      }
    } else if (marker) {
      fence = { mark: marker[1], language: marker[2].trim().split(/\s+/)[0] };
    } else {
      units.push({ line });
      if (visitor) {
        for (const text of line.split(/(\x60+[^\x60]+\x60+)/g)) {
          if (text.startsWith(String.fromCharCode(96))) continue;
          for (const match of text.matchAll(MARKDOWN_REF)) visitor(referenceTarget(match));
        }
      }
    }
  }
  if (fence) units.push({ code: code.join("\n"), language: fence.language });
  return units;
}

function toStorage(units, linkFor) {
  const inline = (line) => line.split(/(\x60+[^\x60]+\x60+)/g).map((part, index) => {
    if (index % 2) return "<code>" + xml(part.replace(/^\x60+|\x60+$/g, "")) + "</code>";
    let output = "";
    let offset = 0;
    for (const match of part.matchAll(MARKDOWN_REF)) {
      output += textMarkup(part.slice(offset, match.index));
      output += linkFor(referenceTarget(match));
      offset = match.index + match[0].length;
    }
    return output + textMarkup(part.slice(offset));
  }).join("");

  const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/;
  const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const heading = /^ {0,3}(#{1,6})\s+(.+)$/;
  const divider = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const isTable = i => units[i]?.line?.includes("|") && separator.test(units[i + 1]?.line ?? "");
  const listType = match => /^[0-9]/.test(match[2]) ? "ol" : "ul";
  const html = [];

  function renderList(index, first) {
    const indent = first[1].length;
    const type = listType(first);
    let output = "<" + type + ">";
    for (; index < units.length;) {
      const item = listItem.exec(units[index].line ?? "");
      if (!item || item[1].length !== indent || listType(item) !== type) break;
      output += "<li>" + inline(item[3]);
      index++;
      const next = listItem.exec(units[index]?.line ?? "");
      if (next && next[1].length > indent && next[1].length - indent <= 8) {
        const nested = renderList(index, next);
        output += nested.html;
        index = nested.index;
      }
      output += "</li>";
    }
    return { html: output + "</" + type + ">", index };
  }

  for (let i = 0; i < units.length;) {
    const { line, code, language } = units[i];
    if (code !== undefined) {
      html.push(storageCode(code, language));
      i++;
    } else if (!line.trim()) {
      i++;
    } else if (isTable(i)) {
      const headers = tableCells(line);
      const row = (cells, tag) => "<tr>" + headers.map((_, index) =>
        "<" + tag + ">" + inline(cells[index] ?? "") + "</" + tag + ">"
      ).join("") + "</tr>";
      let body = "<table><tbody>" + row(headers, "th");
      i += 2;
      while (units[i]?.line?.trim() && units[i].line.includes("|")) body += row(tableCells(units[i++].line), "td");
      html.push(body + "</tbody></table>");
    } else if (heading.test(line)) {
      const [, marks, name] = heading.exec(line);
      const tag = "h" + marks.length;
      const anchor = localSlug(name);
      const macro = anchor ? '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">' +
        xml(anchor) + '</ac:parameter></ac:structured-macro>' : "";
      html.push("<" + tag + ">" + macro + inline(name) + "</" + tag + ">");
      i++;
    } else if (divider.test(line)) {
      html.push("<hr />");
      i++;
    } else if (listItem.test(line)) {
      const list = renderList(i, listItem.exec(line));
      html.push(list.html);
      i = list.index;
    } else if (/^\s*>/.test(line)) {
      const quoted = [];
      while (/^\s*>/.test(units[i]?.line ?? "")) quoted.push(inline(units[i++].line.replace(/^\s*>\s?/, "")));
      html.push("<blockquote><p>" + quoted.join("<br />") + "</p></blockquote>");
    } else {
      const parts = [inline(line)];
      i++;
      while (units[i]?.line?.trim() && !heading.test(units[i].line) && !divider.test(units[i].line)
          && !listItem.test(units[i].line) && !/^\s*>/.test(units[i].line) && !isTable(i)) {
        parts.push(inline(units[i++].line));
      }
      html.push("<p>" + parts.join("<br />") + "</p>");
    }
  }
  return html.join("\n") || "<p></p>";
}

function markdownText(text) {
  return String(text).replace(/[<>&]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char])
    .replace(/([\\\x60*\[\]_|])/g, "\\$1");
}

function fromStorage(body, pageUrl, attachments = new Map()) {
  const ac = "http://atlassian.com/content";
  const ri = "http://atlassian.com/resource/identifier";
  const entities = { nbsp: "&#160;", ndash: "&#8211;", mdash: "&#8212;", hellip: "&#8230;" };
  const storage = body.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map((part, index) =>
    index % 2 ? part : part.replace(/&([a-z]+);/gi, (match, name) =>
      ["amp", "lt", "gt", "quot", "apos"].includes(name) ? match : entities[name] ?? "&amp;" + name + ";")
  ).join("");
  const parsed = new DOMParser().parseFromString(
    '<body xmlns:ac="' + ac + '" xmlns:ri="' + ri + '">' + storage + "</body>", "application/xml"
  );
  if (parsed.getElementsByTagName("parsererror").length) {
    throw new Error("Confluence returned storage markup this version cannot convert.");
  }
  const element = (node, ns, name) =>
    Array.from(node.children).find(child => child.namespaceURI === ns && child.localName === name);
  const contents = node => Array.from(node.childNodes).map(render).join("");
  const block = text => "\n\n" + text.trim() + "\n\n";
  function render(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return markdownText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    const tag = node.localName;
    if (node.namespaceURI === ac && tag === "structured-macro") {
      const name = node.getAttributeNS(ac, "name") || "unknown";
      if (name === "anchor") return "";
      if (name === "code" || name === "noformat") {
        const language = Array.from(node.children).find(el => el.getAttributeNS(ac, "name") === "language");
        return block(codeFence(element(node, ac, "plain-text-body")?.textContent ?? "", (language?.textContent ?? "").replace(/[^a-z0-9+_-]/gi, "")));
      }
      const detail = element(node, ac, "rich-text-body");
      return block("> Confluence macro: " + markdownText(name) + (detail ? "\n" + contents(detail) : ""));
    }
    if (tag === "script" || tag === "style" || tag === "iframe") return "";
    const text = contents(node);
    if (tag === "table") {
      const rows = Array.from(node.getElementsByTagName("tr")).map(row =>
        Array.from(row.children).map(cell => contents(cell).trim().replace(/\s*\n\s*/g, " ")));
      if (!rows.length) return "";
      rows.splice(1, 0, rows[0].map(() => "---"));
      return block(rows.map(row => "| " + row.join(" | ") + " |").join("\n"));
    }
    if (tag === "ol" || tag === "ul") {
      return block(Array.from(node.children).map((item, index) => {
        const lines = contents(item).trim().split("\n");
        return (tag === "ol" ? (index + 1) + ". " : "- ") + lines.map((line, n) => n ? "    " + line : line).join("\n");
      }).join("\n"));
    }
    if (tag === "a" || tag === "link" || tag === "image" || tag === "img") {
      const attachment = element(node, ri, "attachment");
      const targetPage = element(node, ri, "page");
      const imageUrl = element(node, ri, "url");
      const linkBody = element(node, ac, "link-body") || element(node, ac, "plain-text-link-body");
      const label = (linkBody ? contents(linkBody) : text).trim() ||
        markdownText(attachment?.getAttributeNS(ri, "filename") || targetPage?.getAttributeNS(ri, "content-title") ||
          node.getAttribute("alt") || node.getAttribute("href") || "Confluence attachment");
      const local = attachments.get(attachment?.getAttributeNS(ri, "filename"));
      if (local) return (tag === "image" && local.image ? "!" : "") + "[" + label + "](<" + local.path + ">)";
      const anchor = node.getAttributeNS(ac, "anchor");
      const url = webLink(node.getAttribute("href") || node.getAttribute("src") ||
        imageUrl?.getAttributeNS(ri, "value") || (anchor ? "#" + anchor : pageUrl), pageUrl);
      return url ? "[" + label + "](<" + url + ">)" : label;
    }
    if (/^h[1-6]$/.test(tag)) return block("#".repeat(Number(tag[1])) + " " + text);
    if (tag === "p" || tag === "div") return block(text);
    if (tag === "strong" || tag === "b") return "**" + text + "**";
    if (tag === "em" || tag === "i") return "*" + text + "*";
    if (tag === "code") {
      const marker = String.fromCharCode(96);
      const raw = node.textContent;
      const ticks = marker.repeat(Math.max(1, ...(raw.match(/\x60+/g) ?? []).map(run => run.length + 1)));
      return ticks + (raw.includes(marker) ? " " + raw + " " : raw) + ticks;
    }
    if (tag === "pre") return block(codeFence(node.textContent));
    if (tag === "br") return "\n";
    if (tag === "blockquote") return block(text.trim().split("\n").map(line => "> " + line).join("\n"));
    if (tag === "hr") return block("---");
    return text;
  }
  return contents(parsed.documentElement).trim() + "\n";
}

function diffLines(before, after) {
  const left = before.trimEnd().split("\n");
  const right = after.trimEnd().split("\n");
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let end = 0;
  while (start + end < left.length && start + end < right.length &&
      left[left.length - end - 1] === right[right.length - end - 1]) end++;
  if (start === left.length && start === right.length) return "";
  const oldLines = left.slice(start, left.length - end);
  const newLines = right.slice(start, right.length - end);
  const lines = ["@@ from line " + (start + 1) + " @@"];
  const width = newLines.length + 1;
  const cells = (oldLines.length + 1) * width;
  if (cells > 2_000_000) {
    lines.push("Large comparison: changed range shown as two blocks.");
    for (const text of oldLines) lines.push("-" + text);
    for (const text of newLines) lines.push("+" + text);
    return lines.join("\n");
  }
  const matches = new Uint32Array(cells);
  for (let a = oldLines.length - 1; a >= 0; a--) {
    for (let b = newLines.length - 1; b >= 0; b--) {
      const at = a * width + b;
      matches[at] = oldLines[a] === newLines[b] ? 1 + matches[at + width + 1] :
        Math.max(matches[at + width], matches[at + 1]);
    }
  }
  for (let a = 0, b = 0; a < oldLines.length || b < newLines.length;) {
    if (a < oldLines.length && b < newLines.length && oldLines[a] === newLines[b]) {
      lines.push(" " + oldLines[a++]);
      b++;
    } else if (a < oldLines.length && (b === newLines.length ||
        matches[(a + 1) * width + b] >= matches[a * width + b + 1])) {
      lines.push("-" + oldLines[a++]);
    } else {
      lines.push("+" + newLines[b++]);
    }
  }
  return lines.join("\n");
}

function lineChange(before, after, language = "en") {
  const diff = diffLines(before, after);
  return diff ? codeFence(diff, "diff") : translate(language, "No converted Markdown body difference.");
}

function parentPath(path) {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function ancestors(path, stop) {
  const result = [];
  for (let folder = parentPath(path); folder && folder !== stop; folder = parentPath(folder)) result.unshift(folder);
  return result;
}

function localSlug(text) {
  return normalized(text.trim().toLowerCase()).replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/\s+/g, "-");
}

function vaultReference(reference, file, app, source) {
  const url = /^[a-z][a-z+.-]*:/i.test(reference.target) || reference.target.startsWith("//");
  if (url) return null;
  const [path, anchor] = reference.target.split("#", 2);
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const target = decoded ? app.metadataCache.getFirstLinkpathDest(decoded, file.path) : file;
  if (!target?.extension || !target.path.startsWith(source + "/")) return null;
  return { file: target, anchor };
}

async function preparedNotes(app, config) {
  const folder = app.vault.getFolderByPath(config.source);
  if (!folder) throw new Error("The selected source folder does not exist in this vault.");
  const notes = [];
  const folders = new Set();
  const titles = new Set();
  const binaries = new Map();
  const files = app.vault.getMarkdownFiles().filter(file => file.path.startsWith(config.source + "/"));
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    for (const path of ancestors(file.path, config.source)) folders.add(path);
    const title = normalized(file.basename);
    if (titles.has(title.toLowerCase())) throw new SyncError("Duplicate page title in the source folder: {title}", { title });
    if (title.length > 255) throw new SyncError("A source title exceeds the Confluence maximum: {title}", { title: title.slice(0, 100) });
    titles.add(title.toLowerCase());
    const source = await app.vault.read(file);
    const assets = new Map();
    const references = [];
    const units = markdownLines(source, reference => references.push(reference));
    for (const reference of references) {
      const target = vaultReference(reference, file, app, config.source);
      if (!target || target.file.extension?.toLowerCase() === "md") continue;
      let asset = binaries.get(target.file.path);
      if (!asset) {
        if (target.file.stat.size > MAX_ATTACHMENT_BYTES) {
          throw new SyncError("An attachment exceeds this plugin's 25 MiB limit: {name}", { name: target.file.name });
        }
        const data = await app.vault.readBinary(target.file);
        const hash = await digest(data);
        const safeName = target.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
        asset = { data, hash, file: target.file, name: "cfs-" + hash.slice(0, 24) + "-" + safeName };
        binaries.set(target.file.path, asset);
      }
      assets.set(target.file.path, asset);
    }
    const sourceHash = await digest(source);
    const assetHashes = Array.from(assets, ([path, asset]) => [path, asset.hash])
      .sort(([left], [right]) => left.localeCompare(right));
    const inputHash = await digest(JSON.stringify([sourceHash, assetHashes]));
    const dependencies = references.map(reference => vaultReference(reference, file, app, config.source))
      .filter(target => target?.file.extension?.toLowerCase() === "md").map(target => target.file.path);
    notes.push({ file, path: file.path, title, units, assets, sourceHash, inputHash, dependencies });
  }
  return { notes, folders: Array.from(folders).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)) };
}

function resolvedStorage(note, app, client, ids) {
  return toStorage(note.units, reference => {
    const target = vaultReference(reference, note.file, app, client.config.source);
    const label = textMarkup(reference.label);
    if (target) {
      const page = ids.get(target.file.path);
      if (page) {
        const url = client.pageUrl(page) + (target.anchor ? "#" + encodeURIComponent(localSlug(target.anchor)) : "");
        return '<a href="' + xml(url) + '">' + label + "</a>";
      }
      const asset = note.assets.get(target.file.path);
      if (asset) {
        const attachment = '<ri:attachment ri:filename="' + asset.name + '" />';
        if (reference.embed && IMAGE_FILE.test(target.file.name)) {
          return '<ac:image ac:alt="' + xml(reference.label) + '">' + attachment + "</ac:image>";
        }
        return '<ac:link>' + attachment + '<ac:link-body>' + label + '</ac:link-body></ac:link>';
      }
    }
    if (/^https?:\/\//i.test(reference.target)) {
      const url = webLink(reference.target, client.config.origin);
      if (url) return '<a href="' + xml(url) + '">' + label + "</a>";
    }
    return label;
  });
}

function confirmParent(kind, remote, expected, parent, title, spaceId) {
  const id = numericId(remote.id);
  if (remote.status !== "current" || String(remote.parentId) !== parent || String(remote.spaceId) !== spaceId ||
      normalized(remote.title) !== title || (expected?.id && id !== expected.id)) {
    throw new SyncError("Confluence {kind} changed position, name or status: {title}", { kind, title });
  }
  return id;
}

function validateVersion(remote, entry) {
  const version = remote.version.number;
  if (version === entry.version) return false;
  if (entry.pending && version === entry.version + 1 && remote.version.message === entry.pending.message) return true;
  throw new SyncError("Confluence page has an independent edit: {title}. Run Preview Confluence changes.", { title: remote.title });
}

function placeholder(entry) {
  return "<p>Confluence Folder Sync pending " + entry.ticket + "</p>";
}

class Publisher {
  constructor(client, app, profile, save) {
    this.client = client;
    this.app = app;
    this.profile = profile;
    this.save = save;
  }

  async inspect(kind, entries, key, title, parent, catalog) {
    const recorded = entries[key];
    if (recorded?.id) {
      if (!parent || !catalog.has(recorded.id)) throw new SyncError("A mapped item is outside the configured folder: {title}", { title });
      const remote = kind === "page" ? await this.client.page(recorded.id) :
        await this.client.get(API + "/folders/" + recorded.id);
      confirmParent(kind, remote, recorded, parent, title, this.client.spaceId);
      if (kind === "page") validateVersion(remote, recorded);
      return remote;
    }

    const matches = kind === "page" ? await this.client.pageTitles(title) :
      Array.from(catalog.values()).filter(item => parent && String(item.parentId) === parent &&
        normalized(item.title).toLowerCase() === title.toLowerCase());
    if (!matches.length) {
      if (recorded?.creating) throw new SyncError("The previous create result is unknown: {title}", { title });
      return null;
    }
    if (kind === "page" && recorded?.creating && matches.length === 1 && parent) {
      const candidate = await this.client.page(matches[0].id, undefined, true);
      if (candidate.version.number === 1 && candidate.body.storage.value.trim() === placeholder(recorded)) {
        confirmParent(kind, candidate, recorded, parent, title, this.client.spaceId);
        return candidate;
      }
    }
    throw new SyncError("An existing Confluence item is not linked to this source: {title}", { title });
  }

  async plan(tree, catalog) {
    const folders = new Map([[this.client.config.source, this.client.config.folderId]]);
    for (const path of tree.folders) {
      const remote = await this.inspect("folder", this.profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), folders.get(parentPath(path)), catalog);
      folders.set(path, remote ? numericId(remote.id) : null);
    }
    for (const note of tree.notes) {
      await this.inspect("page", this.profile.pages, "file:" + note.file.path, note.title,
        folders.get(parentPath(note.file.path)), catalog);
    }
  }

  async claim(kind, entries, key, title, parent, catalog) {
    let remote = await this.inspect(kind, entries, key, title, parent, catalog);
    const entry = entries[key] ??= { ticket: crypto.randomUUID() };
    if (!remote) {
      entry.creating = true;
      await this.save();
      try {
        remote = await this.client.create(kind, title, parent, placeholder(entry));
      } catch (error) {
        if (error instanceof ApiError && [400, 401, 403, 404, 413, 429].includes(error.status)) {
          delete entry.creating;
          await this.save();
        }
        throw error;
      }
      confirmParent(kind, remote, entry, parent, title, this.client.spaceId);
    }
    if (!entry.id) {
      entry.id = numericId(remote.id);
      if (kind === "page") {
        entry.version = remote.version.number;
        entry.title = title;
        entry.parent = parent;
      }
      delete entry.creating;
      await this.save();
    }
    catalog.set(entry.id, remote);
    return entry;
  }

  async publish(tree, catalog, control = {}) {
    const folders = new Map([[this.client.config.source, this.client.config.folderId]]);
    const ids = new Map(Object.entries(this.profile.pages)
      .filter(([key, entry]) => key.startsWith("file:") && entry.id && catalog.has(entry.id))
      .map(([key, entry]) => [key.slice(5), entry.id]));
    for (const path of tree.folders) {
      await control.check?.();
      const entry = await this.claim("folder", this.profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), folders.get(parentPath(path)), catalog);
      folders.set(path, entry.id);
    }
    for (const note of tree.notes) {
      await control.check?.(note);
      const entry = await this.claim("page", this.profile.pages, "file:" + note.file.path, note.title,
        folders.get(parentPath(note.file.path)), catalog);
      ids.set(note.file.path, entry.id);
    }
    let changed = 0;
    for (const note of tree.notes) {
      await control.check?.(note);
      const entry = this.profile.pages["file:" + note.file.path];
      const page = await this.client.page(entry.id);
      confirmParent("page", page, entry, folders.get(parentPath(note.file.path)), note.title, this.client.spaceId);
      if (validateVersion(page, entry)) {
        entry.version = page.version.number;
        entry.bodyHash = entry.pending.bodyHash;
        entry.sourceHash = entry.pending.sourceHash;
        delete entry.pending;
        delete entry.migratedInputHash;
        await this.save();
      }
      if (entry.migratedInputHash === note.inputHash) continue;
      const body = resolvedStorage(note, this.app, this.client, ids);
      const bodyHash = await digest(body);
      if (bodyHash === entry.bodyHash) {
        if (entry.sourceHash !== note.sourceHash) {
          entry.sourceHash = note.sourceHash;
          entry.inputHash = note.inputHash;
          await this.save();
        }
        continue;
      }
      const assets = Array.from(new Map(Array.from(note.assets.values(), asset => [asset.name, asset])).values());
      if (assets.length) {
        const existing = new Map((await this.client.attachments(entry.id)).map(asset => [asset.title, asset]));
        for (const asset of assets) {
          const found = existing.get(asset.name);
          if (!found) await this.client.upload(entry.id, asset);
          else if (found.comment !== asset.hash || found.fileSize !== asset.data.byteLength) {
            throw new SyncError("An attachment name exists with different content: {title}", { title: note.title });
          }
        }
      }
      const message = "Confluence Folder Sync " + entry.ticket + " " + bodyHash.slice(0, 24);
      entry.pending = { bodyHash, sourceHash: note.sourceHash, message };
      await this.save();
      const result = await this.client.update(page, body, message);
      if (numericId(result.id) !== entry.id || result.version.number !== page.version.number + 1) {
        throw new Error("Confluence did not confirm the expected update.");
      }
      if (!entry.remoteAttachments || assets.length) {
        const inventory = attachmentInventory(await this.client.attachments(entry.id));
        if (!entry.remoteAttachments) {
          entry.remoteAttachments = inventory;
        } else {
          const managed = new Set(assets.map(asset => asset.name));
          const merged = new Map(entry.remoteAttachments.map(asset => [asset.id, asset]));
          for (const asset of inventory) if (managed.has(asset.title)) merged.set(asset.id, asset);
          entry.remoteAttachments = Array.from(merged.values());
        }
      }
      entry.version = result.version.number;
      entry.bodyHash = bodyHash;
      entry.sourceHash = note.sourceHash;
      entry.inputHash = note.inputHash;
      delete entry.pending;
      delete entry.migratedInputHash;
      await this.save();
      changed++;
    }
    return changed;
  }
}


function pageTrails(catalog, root) {
  const trails = new Map();
  for (const [id, item] of catalog) {
    if (item.type !== "page" || item.status !== "current") continue;
    const seen = new Set();
    const trail = [];
    let current = item;
    while (current) {
      const currentId = numericId(current.id);
      if (seen.has(currentId)) throw new Error("Confluence returned a cyclic parent hierarchy.");
      seen.add(currentId);
      trail.unshift(current);
      const parent = String(current.parentId);
      if (parent === root) {
        trails.set(id, trail);
        break;
      }
      current = catalog.get(parent);
    }
  }
  return trails;
}

async function checkedBody(client, item, version) {
  const page = await client.page(item.id, version, true);
  if (String(page.id) !== String(item.id) || String(page.spaceId) !== client.spaceId ||
      page.version.number !== (version ?? item.version.number) ||
      (version === undefined && (String(page.parentId) !== String(item.parentId) || page.status !== "current"))) {
    throw new Error("A page changed during this run. Run the command again.");
  }
  const value = page.body?.storage?.value;
  if (typeof value !== "string") throw new Error("Confluence did not return the page's storage body.");
  return value;
}

function readableComponent(item) {
  let title = normalized(item.title).replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, "-").replace(/^[. ]+|[. ]+$/g, "");
  title = Array.from(title).slice(0, 45).join("").trim();
  return (title || "Confluence") + " -- " + numericId(item.id);
}

async function makeVaultFolders(vault, target, inbox) {
  if (!pathIn(target, inbox)) throw new Error("The import path is outside the configured import folder.");
  const parts = target.split("/");
  let folder;
  for (const part of parts) {
    folder = folder ? folder + "/" + part : part;
    if (vault.getFolderByPath(folder)) continue;
    if (vault.getAbstractFileByPath(folder)) throw new SyncError("A file occupies the import folder path: {path}", { path: folder });
    try {
      await vault.createFolder(folder);
    } catch (error) {
      if (!vault.getFolderByPath(folder)) throw error;
    }
  }
}

function attachmentName(entry) {
  const name = normalized(entry.title).replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, "-").trim();
  return entry.id + "-v" + entry.version + "-" + (Array.from(name).slice(-100).join("").replace(/[. ]+$/g, "") || "attachment");
}

async function copyRemotePage(vault, client, page, trail, body, destination) {
  const directory = destination + "/" + trail.map(readableComponent).join("/");
  const id = numericId(page.id);
  const version = page.version.number;
  const url = client.pageUrl(id);
  const attachments = await client.attachments(id);
  const inventory = attachmentInventory(attachments);
  const seen = new Set();
  if (inventory.some(asset => asset.size > MAX_ATTACHMENT_BYTES)) {
    throw new SyncError("A Confluence attachment exceeds the 25 MiB limit for {title}.", { title: page.title });
  }
  await makeVaultFolders(vault, directory, client.config.inbox);
  if (attachments.length) await makeVaultFolders(vault, directory + "/Attachments", client.config.inbox);
  const links = new Map();
  for (const attachment of attachments) {
    const entry = attachmentEntry(attachment);
    if (seen.has(entry.title)) throw new Error("Confluence returned duplicate attachment names.");
    seen.add(entry.title);
    const name = attachmentName(entry);
    const path = directory + "/Attachments/" + name;
    const data = await client.downloadAttachment(id, attachment);
    const prior = vault.getFileByPath(path);
    if (!prior) await vault.createBinary(path, data);
    else if (await digest(await vault.readBinary(prior)) !== await digest(data)) {
      throw new SyncError("An existing local attachment has different content: {name}", { name });
    }
    links.set(entry.title, { path: "Attachments/" + encodeURIComponent(name), image: IMAGE_FILE.test(entry.title) });
  }
  const markdown = "# " + markdownText(page.title) + "\n\n[Confluence · version " + version + "](" + url + ")\n\n" +
    fromStorage(body, url, links) + (links.size ? "\n## Confluence attachments\n\n" +
      Array.from(links, ([title, link]) => "- [" + markdownText(title) + "](<" + link.path + ">)").join("\n") + "\n" : "");
  const path = directory + "/v" + version + ".md";
  const existing = vault.getFileByPath(path);
  if (existing && await vault.read(existing) !== markdown) {
    throw new SyncError("An existing local file has different contents: {path}", { path });
  }
  const file = existing ?? await vault.create(path, markdown);
  return { file, inventory };
}

async function remotePages(client, catalog) {
  const trails = pageTrails(catalog, client.config.folderId);
  const pages = await client.currentPages(Array.from(trails.keys()));
  for (const [id, page] of pages) {
    if (String(page.parentId) !== String(trails.get(id).at(-1).parentId)) {
      throw new Error("A page moved during this run. Run the command again.");
    }
  }
  return { trails, pages };
}

async function downloadSnapshot(vault, client, remote, selectedId) {
  const language = client.config.language ?? "en";
  const t = (message, values) => translate(language, message, values);
  const copies = [];
  const selection = selectedId ? [[selectedId, remote.pages.get(selectedId)]] : Array.from(remote.pages);
  if (selection.some(([, page]) => !page)) throw new Error("The selected page is unavailable in this folder.");
  if (!selection.length) throw new Error("The selected folder contains no pages.");
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = client.config.inbox + "/Snapshots/" + date + " " + crypto.randomUUID().slice(0, 8);
  try {
    for (const [id, page] of selection) {
      const body = await checkedBody(client, page);
      const copy = await copyRemotePage(vault, client, page, remote.trails.get(id), body, destination);
      copies.push(copy.file);
    }
  } catch (error) {
    throw new SyncError("Snapshot stopped after {count} copies. {reason} Check {path} for saved files.",
      { count: copies.length, reason: localizedError(error, language), path: destination });
  }
  const summary = t("{count} current copies saved", { count: copies.length });
  if (copies.length === 1) return { file: copies[0], summary };
  const links = copies.map(file => {
    const route = file.path.slice(destination.length + 1);
    return "- [" + markdownText(parentPath(route).split("/").at(-1)) + "](<" + encodeURI(route).replace(/#/g, "%23") + ">)";
  });
  const file = await vault.create(destination + "/Snapshot index.md",
    "# " + t("Confluence snapshot") + "\n\n" + summary + "\n\n" + links.join("\n") + "\n");
  return { file, summary };
}

async function incoming(app, client, catalog, profile, save, importNew) {
  const language = client.config.language ?? "en";
  const t = (message, values) => translate(language, message, values);
  const { trails, pages } = await remotePages(client, catalog);
  const linked = new Map(Object.entries(profile.pages).filter(([, entry]) => entry.id).map(([key, entry]) =>
    [entry.id, { ...entry, path: key.slice(5) }]));
  const changes = [];
  let newCount = 0;
  let changedCount = 0;
  let importedCount = 0;
  let baselines = 0;
  const remoteAttachments = new Map();
  if (!importNew) {
    const trackedIds = Array.from(pages.keys()).filter(id => linked.has(id) || profile.imports[id]);
    for (let start = 0; start < trackedIds.length; start += 4) {
      const batch = trackedIds.slice(start, start + 4);
      await Promise.all(batch.map(async id => {
        remoteAttachments.set(id, attachmentInventory(await client.attachments(id)));
      }));
    }
  }
  for (const [id, page] of pages) {
    const local = linked.get(id) ?? profile.imports[id];
    const label = "[" + markdownText(page.title) + "](" + client.pageUrl(id) + ")";
    if (!local) {
      newCount++;
      if (importNew) {
        const body = await checkedBody(client, page);
        const copy = await copyRemotePage(app.vault, client, page, trails.get(id), body,
          client.config.inbox + "/Imported pages");
        profile.imports[id] = { path: copy.file.path, version: page.version.number, title: page.title,
          parent: String(page.parentId), remoteAttachments: copy.inventory };
        await save();
        importedCount++;
      }
      changes.push("- " + t("New") + " · " + label);
      continue;
    }
    const version = page.version.number;
    const moved = String(page.parentId) !== local.parent;
    const renamed = page.title !== local.title;
    const inventory = remoteAttachments.get(id);
    let fileChanges = [];
    if (inventory) {
      if (local.remoteAttachments) {
        fileChanges = attachmentDiff(local.remoteAttachments, inventory);
      } else {
        const entry = linked.has(id) ? profile.pages["file:" + local.path] : profile.imports[id];
        entry.remoteAttachments = inventory;
        baselines++;
      }
    }
    if (version === local.version && !moved && !renamed && !fileChanges.length) continue;
    changedCount++;
    if (importNew) continue;
    const details = ["### " + label, "- " + t("Confluence version {before} → {after}", { before: local.version, after: version }),
      "- " + t("Local path: {path}", { path: markdownText(local.path) })];
    const file = app.vault.getFileByPath(local.path);
    const localText = file ? await app.vault.read(file) : null;
    const both = linked.has(id) && localText !== null && local.sourceHash && await digest(localText) !== local.sourceHash;
    if (both) details.push("- " + t("Both the local note and the Confluence page changed."));
    if (moved) details.push("- " + t("The Confluence parent changed."));
    if (renamed) details.push("- " + t("The Confluence title changed."));
    for (const file of fileChanges) {
      const versionLabel = file.before ? "v" + file.before + " → v" + file.version : "v" + file.version;
      details.push("- " + t("Attachment " + file.kind.toLowerCase()) + " · " + markdownText(file.title) + " · " + versionLabel);
    }
    if (version !== local.version) {
      const url = client.pageUrl(id);
      const latest = fromStorage(await checkedBody(client, page), url);
      try {
        details.push(lineChange(fromStorage(await checkedBody(client, page, local.version), url), latest, language));
      } catch (error) {
        if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
        details.push(t("The previous version cannot be read."), codeFence(latest, "markdown"));
      }
      if (both) details.push(t("Current local text compared with Confluence:"), lineChange(localText, latest, language));
    }
    changes.push(details.join("\n\n"));
  }

  const missing = new Set([...linked.keys(), ...Object.keys(profile.imports)]);
  for (const id of pages.keys()) missing.delete(id);
  for (const id of missing) changes.push("- " + t("Outside the selected hierarchy or unavailable") + " · " + client.pageUrl(id));
  const summary = t("{new} new · {changed} changed · {imported} imported · {missing} unavailable",
    { new: newCount, changed: changedCount, imported: importedCount, missing: missing.size });
  const title = importNew ? "Confluence import report" : "Confluence change preview";
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const path = client.config.inbox + "/" + title + " " + date + " " + crypto.randomUUID().slice(0, 8) + ".md";
  const instructions = importNew ?
    "New pages and their attachments are saved under Imported pages." :
    "Review the differences and copy the changes you want to incorporate into the original note.";
  if (baselines) {
    await save();
    changes.unshift(t("Recorded current attachment versions for {count} previously tracked pages.", { count: baselines }));
  }
  await makeVaultFolders(app.vault, client.config.inbox, client.config.inbox);
  const file = await app.vault.create(path, "# " + t(title) + "\n\n" + summary + "\n\n" + t(instructions) +
    (changes.length ? "\n\n" + changes.join("\n\n") : "") + "\n");
  return { file, summary };
}

function reviewHunks(before, after) {
  const diff = diffLines(before, after);
  if (!diff) return [];
  const lines = diff.split("\n");
  const first = /^@@ from line (\d+) @@$/.exec(lines.shift());
  if (!first || lines[0]?.startsWith("Large comparison:")) {
    throw new Error("This comparison is too large for selective application. Use the regular preview.");
  }
  const base = before.trimEnd().split("\n");
  const hunks = [];
  let offset = Number(first[1]) - 1;
  let active;
  for (const line of lines) {
    const marker = line[0];
    if (marker === " ") {
      if (active) hunks.push(active);
      active = null;
      offset++;
      continue;
    }
    if (marker !== "-" && marker !== "+") throw new Error("The comparison could not be split into changes.");
    active ??= { offset, remove: [], insert: [] };
    if (marker === "-") {
      active.remove.push(line.slice(1));
      offset++;
    } else {
      active.insert.push(line.slice(1));
    }
  }
  if (active) hunks.push(active);
  return hunks.map(hunk => ({
    ...hunk,
    before: nearestNonblank(base, hunk.offset - 1, -1),
    after: nearestNonblank(base, hunk.offset + hunk.remove.length, 1),
  }));
}

function nearestNonblank(lines, position, step) {
  for (let at = position; at >= 0 && at < lines.length; at += step) {
    if (lines[at].trim()) return lines[at];
  }
  return null;
}

function textLines(text) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function matchHunk(lines, hunk) {
  const locations = [];
  const matchesContext = start => {
    const before = nearestNonblank(lines, start - 1, -1);
    const after = nearestNonblank(lines, start + hunk.remove.length, 1);
    return before === hunk.before && after === hunk.after;
  };
  for (let start = 0; start <= lines.length - hunk.remove.length; start++) {
    if (hunk.remove.every((line, index) => line === lines[start + index]) && matchesContext(start)) {
      locations.push(start);
    }
  }
  if (hunk.remove.length) return locations.length === 1 ? locations[0] : null;
  // Empty lines between the same two anchors are equivalent insertion locations.
  // Distinct occurrences of the anchors are ambiguous.
  if (!locations.length ||
      locations.some((at, index) => index && at !== locations[index - 1] + 1)) return null;
  return locations[0];
}

function mergeSelected(original, chunks) {
  if (/\r(?!\n)/.test(original) || (original.includes("\r\n") && /(^|[^\r])\n/.test(original))) {
    throw new Error("This note has mixed line endings. Apply the changes manually.");
  }
  const lines = textLines(original);
  const sorted = chunks.slice().sort((left, right) => right.at - left.at);
  let boundary = lines.length + 1;
  for (const chunk of sorted) {
    if (chunk.at === null || chunk.at >= boundary || chunk.at + chunk.remove.length > boundary ||
        !chunk.remove.every((line, index) => lines[chunk.at + index] === line)) {
      throw new Error("The selected changes overlap or no longer match the note.");
    }
    lines.splice(chunk.at, chunk.remove.length, ...chunk.insert);
    boundary = chunk.at;
  }
  return lines.join(original.includes("\r\n") ? "\r\n" : "\n");
}

function mappedSource(profile, id, source) {
  const matches = Object.entries(profile.pages).filter(([key, entry]) =>
    key.startsWith("file:") && entry.id === id && key.slice(5).startsWith(source + "/"));
  if (matches.length !== 1) throw new Error("This page is not linked to one published note in the active source folder.");
  const [[key, entry]] = matches;
  return { path: key.slice(5), entry };
}

async function prepareLocalReview(app, client, profile, page) {
  const id = numericId(page.id);
  const { path, entry } = mappedSource(profile, id, client.config.source);
  if (entry.pending || entry.creating || !entry.bodyHash) {
    throw new Error("The link has an unfinished publish. Resolve it before reviewing edits.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file || file.extension !== "md") throw new SyncError("The linked local Markdown file is unavailable: {path}", { path });
  const original = await app.vault.read(file);
  const latest = await checkedBody(client, page);
  const prior = page.version.number === entry.version ? latest : await checkedBody(client, page, entry.version);
  const url = client.pageUrl(id);
  const hunks = reviewHunks(fromStorage(prior, url), fromStorage(latest, url));
  return { id, path, original, baseVersion: entry.version, version: page.version.number,
    bodyHash: await digest(latest), origin: client.config.origin, folderId: client.config.folderId,
    hunks: hunks.map(hunk => ({ ...hunk, at: matchHunk(textLines(original), hunk) })) };
}

function editorMatches(app, path, original) {
  return app.workspace.getLeavesOfType("markdown").every(({ view }) =>
    view.file?.path !== path || !view.editor ||
      view.editor.getValue().replace(/\r\n/g, "\n") === original.replace(/\r\n/g, "\n"));
}

async function applyLocalReview(app, client, profile, page, review, selection) {
  if (client.config.origin !== review.origin || client.config.folderId !== review.folderId ||
      String(page.id) !== review.id || page.version.number !== review.version) {
    throw new Error("The Confluence page or destination changed. Review the latest version again.");
  }
  const { path, entry } = mappedSource(profile, review.id, client.config.source);
  if (path !== review.path || entry.version !== review.baseVersion || entry.pending ||
      await digest(await checkedBody(client, page)) !== review.bodyHash) {
    throw new Error("The Confluence page or its link changed. Review the latest version again.");
  }
  const indexes = Array.from(new Set(selection));
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || !review.hunks[index])) {
    throw new Error("Select at least one valid change.");
  }
  const changed = mergeSelected(review.original, indexes.map(index => review.hunks[index]));
  if (changed === review.original) throw new Error("The selected changes would not modify the note.");
  const file = app.vault.getFileByPath(path);
  if (!file || await app.vault.read(file) !== review.original || !editorMatches(app, path, review.original)) {
    throw new Error("The local note changed after review. Review it again.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + " " + crypto.randomUUID().slice(0, 8);
  const backup = client.config.inbox + "/Backups/" + stamp + "/" + path.slice(client.config.source.length + 1);
  await makeVaultFolders(app.vault, parentPath(backup), client.config.inbox);
  await app.vault.create(backup, review.original);

  // Recheck after creating the backup and let Vault.process guard against a newer local edit.
  const latest = await client.page(review.id);
  if (String(latest.id) !== review.id || String(latest.spaceId) !== client.spaceId ||
      latest.version.number !== review.version || String(latest.parentId) !== String(page.parentId) ||
      latest.title !== page.title || latest.status !== "current") {
    throw new Error("The Confluence page changed while preparing the backup. No local change was applied.");
  }
  await app.vault.process(file, current => {
    if (current !== review.original || file.path !== path || !editorMatches(app, path, current)) {
      throw new Error("The local note changed while applying the selection. No local change was applied.");
    }
    return changed;
  });
  return { count: indexes.length, backup };
}

function publicationTarget(config) {
  return JSON.stringify([config.origin, config.folderId, config.source]);
}

function selectionTree(tree, paths) {
  const selected = new Set(paths);
  const notes = tree.notes.filter(note => selected.has(note.path));
  const folders = new Set(notes.flatMap(note => ancestors(note.path, tree.source)));
  return { ...tree, notes, folders: tree.folders.filter(path => folders.has(path)) };
}

async function publicationReview(app, client, profile, tree, catalog) {
  const config = client.config;
  const publisher = new Publisher(client, app, profile, async () => {});
  const folders = new Map([[config.source, { id: config.folderId }]]);
  const ids = new Map(Object.entries(profile.pages)
    .filter(([key, entry]) => key.startsWith("file:") && entry.id && catalog.has(entry.id))
    .map(([key, entry]) => [key.slice(5), entry.id]));
  for (const path of tree.folders) {
    const parent = folders.get(parentPath(path));
    try {
      if (parent?.error) throw parent.error;
      const remote = await publisher.inspect("folder", profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), parent?.id ?? null, catalog);
      folders.set(path, { id: remote?.id ?? null });
    } catch (error) {
      folders.set(path, { error });
    }
  }
  const rows = [];
  for (const note of tree.notes) {
    const entry = profile.pages["file:" + note.path];
    const parent = folders.get(parentPath(note.path));
    const row = { path: note.path, inputHash: note.inputHash, title: note.title, id: entry?.id ?? null,
      dependencies: Array.from(new Set(note.dependencies.filter(path => path !== note.path && !ids.has(path)))) };
    try {
      if (parent?.error) throw parent.error;
      const page = await publisher.inspect("page", profile.pages, "file:" + note.path,
        note.title, parent?.id ?? null, catalog);
      row.version = page?.version.number ?? null;
      row.parent = page ? String(page.parentId) : null;
      row.outputHash = await digest(resolvedStorage(note, app, client, ids));
      row.status = !page ? "New" : entry.creating || entry.pending ? "Changed" :
        entry.migratedInputHash === note.inputHash ||
        row.outputHash === entry.bodyHash ? "Unchanged" : "Changed";
    } catch (error) {
      row.status = "Conflict";
      row.reason = localizedError(error, config.language);
    }
    rows.push(row);
  }
  for (const row of rows) row.fingerprint = await digest(JSON.stringify(row));
  return { target: publicationTarget(config), rows, source: config.source,
    destination: new URL(config.origin).hostname + " / " + config.folderId };
}

function checkedSelection(review, current, paths) {
  if (review.target !== current.target) throw new Error("The publication destination changed. Refresh the review.");
  const selected = new Set(paths);
  if (!selected.size) throw new Error("Select at least one eligible note.");
  const ready = new Map(current.rows.map(row => [row.path, row]));
  for (const path of selected) {
    const row = ready.get(path);
    const prior = review.rows.find(item => item.path === path);
    if (!prior || !row || !["New", "Changed"].includes(row.status) || row.fingerprint !== prior.fingerprint) {
      throw new Error("A selected note or page changed. Refresh the publication review.");
    }
    if (row.dependencies.some(dependency => !selected.has(dependency))) {
      throw new Error("Also select the unpublished notes referenced by your selection.");
    }
  }
  return selected;
}

async function publishSelection(app, client, profile, save, review, paths, control = {}) {
  if (!client.config.allowPublish) throw new Error("Enable publishing in the plugin settings first.");
  const tree = await preparedNotes(app, client.config);
  tree.source = client.config.source;
  const catalog = await client.catalog();
  const current = await publicationReview(app, client, profile, tree, catalog);
  const selected = checkedSelection(review, current, paths);
  const subset = selectionTree(tree, selected);
  // Re-read after remote preflight. A modal can stay open while local files change.
  for (const note of subset.notes) {
    if (note.file.path !== note.path || await digest(await app.vault.read(note.file)) !== note.sourceHash) {
      throw new Error("A selected note or page changed. Refresh the publication review.");
    }
  }
  const publisher = new Publisher(client, app, profile, save);
  await publisher.plan(subset, catalog);
  return publisher.publish(subset, catalog, {
    ...control,
    check: async note => {
      await control.check?.(note);
      for (const selectedNote of note ? [note] : subset.notes) {
        if (selectedNote.file.path !== selectedNote.path ||
            await digest(await app.vault.read(selectedNote.file)) !== selectedNote.sourceHash) {
          throw new Error("A selected note or page changed. Refresh the publication review.");
        }
        for (const [path, asset] of selectedNote.assets) {
          if (asset.file.path !== path || await digest(await app.vault.readBinary(asset.file)) !== asset.hash) {
            throw new Error("A selected note or page changed. Refresh the publication review.");
          }
        }
      }
    },
  });
}

class PublicationModal extends Modal {
  constructor(plugin, review) {
    super(plugin.app);
    this.plugin = plugin;
    this.review = review;
    this.selection = new Set();
    this.t = (message, values) => plugin.t(message, values);
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-publication");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl, t, review } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Review publication") });
    contentEl.createEl("p", { text: review.source + " → " + review.destination });
    const counts = ["New", "Changed", "Unchanged", "Conflict"].map(status =>
      t(status) + " " + review.rows.filter(row => row.status === status).length);
    contentEl.createEl("p", { text: counts.join(" · "), attr: { role: "status", "aria-live": "polite" } });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status" } });
    if (!this.plugin.data.settings.allowPublish) contentEl.createEl("p", { text: t("Enable publishing in the plugin settings first.") });
    const controls = new Setting(contentEl);
    controls.addButton(button => button.setButtonText(t("Select eligible notes")).setDisabled(this.busy)
      .onClick(() => {
        this.selection = new Set(review.rows.filter(row => ["New", "Changed"].includes(row.status)).map(row => row.path));
        this.render();
      }));
    controls.addButton(button => button.setButtonText(t("Clear selection")).setDisabled(this.busy)
      .onClick(() => { this.selection.clear(); this.render(); }));
    controls.addButton(button => button.setButtonText(t("Refresh review")).setDisabled(this.busy).onClick(() => this.refresh()));
    new Setting(contentEl).setName(t("Filter notes")).addText(input => input.setValue(this.filter ?? "")
      .setPlaceholder(t("Title or folder")).setDisabled(this.busy).onChange(value => {
        this.filter = value;
        this.renderRows();
      }));
    this.rowsEl = contentEl.createDiv({ cls: "cfs-publication-rows" });
    this.renderRows();
    new Setting(contentEl).setName(t("Selected notes: {count}", { count: this.selection.size }))
      .addButton(button => {
        this.publishButton = button;
        button.setButtonText(t("Publish selected")).setCta()
          .setDisabled(this.busy || !this.selection.size || !this.plugin.data.settings.allowPublish)
          .onClick(() => this.publish());
      });
  }

  renderRows() {
    const { rowsEl, t } = this;
    rowsEl.empty();
    const query = normalized(this.filter ?? "").trim().toLowerCase();
    for (const row of this.review.rows.filter(item => normalized(item.path).toLowerCase().includes(query))) {
      const description = row.reason ?? (row.dependencies.length ?
        t("Also required: {paths}", { paths: row.dependencies.join(", ") }) : row.id ? "Confluence " + row.id + " · v" + row.version : "");
      new Setting(rowsEl).setName(t(row.status) + " · " + row.path).setDesc(description)
        .addToggle(toggle => toggle.setValue(this.selection.has(row.path))
          .setDisabled(this.busy || !["New", "Changed"].includes(row.status)).onChange(enabled => {
            if (enabled) this.selection.add(row.path);
            else this.selection.delete(row.path);
            this.render();
          }));
    }
  }

  async refresh() {
    this.busy = true;
    this.render();
    try {
      this.review = await this.plugin.preparePublication();
      this.selection.clear();
      this.status = "";
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  async publish() {
    if (this.busy || !this.opened) return;
    this.busy = true;
    const paths = Array.from(this.selection);
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Publish selected"),
        this.t("Publish {count} selected notes to {destination}?", { count: paths.length, destination: this.review.destination }),
        this.t("Publish")) || !this.opened) return;
      const updated = await this.plugin.withConnection(({ client, profile, save }) =>
        publishSelection(this.app, client, profile, save, this.review, paths));
      this.status = this.t("Published {count} selected notes.", { count: updated });
      this.review = await this.plugin.preparePublication();
      this.selection.clear();
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}

async function prepareConflict(app, client, profile, page) {
  const { path, entry } = mappedSource(profile, numericId(page.id), client.config.source);
  if (entry.pending || entry.creating || !entry.bodyHash) {
    throw new Error("The link has an unfinished publish. Resolve it before reviewing edits.");
  }
  if (page.title !== entry.title || String(page.parentId) !== entry.parent) {
    throw new Error("Resolve page moves or title changes before resolving text.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file) throw new SyncError("The linked local Markdown file is unavailable: {path}", { path });
  const original = await app.vault.read(file);
  const latest = await checkedBody(client, page);
  const prior = await checkedBody(client, page, entry.version);
  const url = client.pageUrl(page.id);
  return { id: String(page.id), path, original, local: original, base: fromStorage(prior, url),
    remote: fromStorage(latest, url), version: page.version.number, baseVersion: entry.version,
    title: page.title, parent: String(page.parentId), bodyHash: await digest(latest),
    inventory: attachmentInventory(await client.attachments(page.id)),
    target: publicationTarget(client.config) };
}

async function resolveConflict(app, client, profile, save, review, text) {
  if (review.target !== publicationTarget(client.config) || typeof text !== "string") {
    throw new Error("The Confluence page or destination changed. Review the latest version again.");
  }
  const { path, entry } = mappedSource(profile, review.id, client.config.source);
  if (path !== review.path || entry.version !== review.baseVersion || entry.pending || entry.creating) {
    throw new Error("The Confluence page or its link changed. Review the latest version again.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file || await app.vault.read(file) !== review.original || !editorMatches(app, path, review.original)) {
    throw new Error("The local note changed after review. Review it again.");
  }
  const checkRemote = async () => {
    const page = await client.page(review.id, undefined, true);
    if (String(page.id) !== review.id || page.status !== "current" || String(page.spaceId) !== client.spaceId || page.title !== review.title ||
        String(page.parentId) !== review.parent || page.version.number !== review.version ||
        await digest(page.body?.storage?.value ?? "") !== review.bodyHash ||
        JSON.stringify(attachmentInventory(await client.attachments(review.id))) !== JSON.stringify(review.inventory)) {
      throw new Error("The Confluence page changed. Review the conflict again.");
    }
  };
  await checkRemote();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + " " + crypto.randomUUID().slice(0, 8);
  const backup = client.config.inbox + "/Backups/" + stamp + "/" + path.slice(client.config.source.length + 1);
  await makeVaultFolders(app.vault, parentPath(backup), client.config.inbox);
  await app.vault.create(backup, review.original);
  await checkRemote();
  await app.vault.process(file, current => {
    if (current !== review.original || file.path !== path || !editorMatches(app, path, current)) {
      throw new Error("The local note changed while applying the selection. No local change was applied.");
    }
    return text;
  });
  const priorEntry = structuredClone(entry);
  entry.version = review.version;
  entry.bodyHash = review.bodyHash;
  entry.sourceHash = await digest(review.remote);
  entry.remoteAttachments = review.inventory;
  delete entry.migratedInputHash;
  delete entry.inputHash;
  try {
    if (text === review.remote) {
      const tree = await preparedNotes(app, client.config);
      const note = tree.notes.find(item => item.path === path);
      if (!note || note.sourceHash !== await digest(text) || file.path !== path || !editorMatches(app, path, text)) {
        throw new Error("The local note changed after review. Review it again.");
      }
      entry.migratedInputHash = note.inputHash;
      entry.sourceHash = note.sourceHash;
    }
    await save();
  } catch (error) {
    for (const key of Object.keys(entry)) delete entry[key];
    Object.assign(entry, priorEntry);
    throw error;
  }
  return { backup, path, afterHash: await digest(text) };
}

class ConflictModal extends Modal {
  constructor(plugin, review) {
    super(plugin.app);
    this.plugin = plugin;
    this.review = review;
    this.text = review.original;
    this.t = (message, values) => plugin.t(message, values);
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-conflict");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl, t, review } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Resolve text conflict") });
    contentEl.createEl("p", { text: review.path + " · Confluence v" + review.baseVersion + " → v" + review.version });
    contentEl.createEl("p", { text: t("Review converted text. Attachments stay in Confluence. Publishing the resolution is a separate action.") });
    const columns = contentEl.createDiv({ cls: "cfs-conflict-columns" });
    for (const [label, text] of [["Previous baseline", review.base], ["Current local note", review.local], ["Current Confluence page", review.remote]]) {
      const column = columns.createDiv();
      column.createEl("h3", { text: t(label) });
      column.createEl("pre", { text, attr: { tabindex: "0", "aria-label": t(label) } });
    }
    new Setting(contentEl).setName(t("Resolution text"))
      .addButton(button => button.setButtonText(t("Use local text")).setDisabled(this.busy)
        .onClick(() => { this.text = review.local; this.render(); }))
      .addButton(button => button.setButtonText(t("Use Confluence text")).setDisabled(this.busy)
        .onClick(() => { this.text = review.remote; this.render(); }));
    const editor = contentEl.createEl("textarea", { cls: "cfs-resolution", attr: { "aria-label": t("Resolution text") } });
    editor.value = this.text;
    editor.disabled = Boolean(this.busy);
    editor.addEventListener("input", () => { this.text = editor.value; });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status" } });
    new Setting(contentEl).addButton(button => button.setButtonText(t("Save resolution locally")).setCta()
      .setDisabled(this.busy).onClick(() => this.apply()));
  }

  async apply() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Save resolution locally"),
        this.t("Back up {path}, save the reviewed text, and accept Confluence v{version} as the new baseline?",
          { path: this.review.path, version: this.review.version }), this.t("Apply changes")) || !this.opened) return;
      const result = await this.plugin.withConnection(({ client, profile, save }) =>
        resolveConflict(this.app, client, profile, save, this.review, this.text));
      this.status = this.t("Resolution saved. Review publication to upload your chosen text.");
      this.close();
      new Notice(this.status);
      return result;
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}

class SyncDashboard extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.t = (message, values) => plugin.t(message, values);
    this.pages = [];
    this.versions = [];
    this.status = this.t("Load pages to view their Confluence versions.");
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-dashboard");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl, t } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Confluence Folder Sync" });
    contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    const button = (label, callback, disabled = false) => component =>
      component.setButtonText(t(label)).setDisabled(this.busy || disabled).onClick(callback);
    const command = action => () => {
      this.close();
      void this.plugin.run(action);
    };
    new Setting(contentEl).setName(t("Check and sync"))
      .addButton(button("Preview changes", command("preview")))
      .addButton(button("Import new pages", command("import")))
      .addButton(button("Review publication", command("publish")));
    new Setting(contentEl).setName(t("Download the full folder"))
      .setDesc(t("Save every current page as a new snapshot under the import folder."))
      .addButton(button("Download snapshot", () => this.saveSnapshot()));
    new Setting(contentEl).setName(t("Page versions"))
      .addButton(button("Load pages", () => this.loadPages()));

    if (!this.pages.length) return;
    const selectPage = new Setting(contentEl).setName(t("Confluence page"));
    selectPage.addDropdown(dropdown => {
      this.pageDropdown = dropdown;
      dropdown.setDisabled(this.busy);
      this.filterPages(this.filter ?? "");
      dropdown.onChange(value => {
        this.pageId = value;
        this.versions = [];
        this.difference = null;
        this.review = null;
        this.backup = null;
        this.render();
      });
    });
    new Setting(contentEl).setName(t("Filter pages"))
      .addText(input => input.setValue(this.filter ?? "").setPlaceholder(t("Title or folder"))
        .setDisabled(this.busy).onChange(value => this.filterPages(value)));
    new Setting(contentEl).setName(t("Selected page"))
      .addButton(button("Load versions", () => this.loadVersions(), !this.pageId))
      .addButton(button("Review local application", () => this.loadReview(), !this.pageId))
      .addButton(button("Download latest copy", () => this.saveSnapshot(this.pageId), !this.pageId));
    new Setting(contentEl).setName(t("Conflict resolution"))
      .addButton(button("Resolve text conflict", () => this.resolveConflict(), !this.pageId));
    if (this.versions.length > 1) {
      const version = (field, name) => dropdown => {
        dropdown.setDisabled(this.busy);
        dropdown.selectEl.setAttribute("aria-label", name);
        for (const entry of this.versions) {
          const date = entry.createdAt ? " · " + entry.createdAt.slice(0, 10) : "";
          dropdown.addOption(String(entry.number), "v" + entry.number + date);
        }
        dropdown.setValue(String(this[field])).onChange(value => { this[field] = Number(value); });
      };
      new Setting(contentEl).setName(t("Compare versions"))
        .addDropdown(version("before", t("Base version")))
        .addDropdown(version("after", t("Comparison version")))
        .addButton(button("Compare", () => this.compareVersions()));
    }
    if (this.difference) {
      contentEl.createEl("h3", { text: this.difference.title });
      this.renderDiff(contentEl, this.difference.text.split("\n"), t("Version differences"));
    }
    if (this.review?.hunks.length) {
      const { path, baseVersion, version, hunks } = this.review;
      contentEl.createEl("h3", { text: t("Apply selected changes to {path}", { path }) });
      contentEl.createEl("p", { text: "Confluence v" + baseVersion + " → v" + version });
      for (const [index, hunk] of hunks.entries()) {
        const label = t("Change {number}", { number: index + 1 });
        new Setting(contentEl).setName(label).setDesc(hunk.at === null ?
          t("The local context is missing or ambiguous.") : t("Local line {number}", { number: hunk.at + 1 }))
          .addToggle(toggle => toggle.setDisabled(this.busy || hunk.at === null)
            .setValue(this.selection.has(index)).onChange(enabled => {
              if (enabled) this.selection.add(index);
              else this.selection.delete(index);
              this.applyButton?.setDisabled(this.selection.size === 0);
            }));
        this.renderDiff(contentEl, [
          ...hunk.remove.map(line => "-" + line), ...hunk.insert.map(line => "+" + line),
        ], label);
      }
      new Setting(contentEl).addButton(component => {
        this.applyButton = component;
        button("Apply selected changes", () => this.applyReview(), !this.selection.size)(component);
      });
    }
    if (this.backup) {
      new Setting(contentEl).setName(t("Backup saved"))
        .addButton(button("Open backup", async () => {
          const file = this.app.vault.getFileByPath(this.backup);
          if (file) await this.app.workspace.getLeaf("tab").openFile(file);
          this.close();
        }));
    }
  }

  renderDiff(parent, lines, label) {
    const diff = parent.createEl("pre", { cls: "cfs-diff", attr: { tabindex: "0", "aria-label": label } });
    for (const line of lines) {
      const cls = line.startsWith("+") ? "cfs-added" : line.startsWith("-") ? "cfs-removed" : "";
      diff.createSpan({ text: line + "\n", cls });
    }
  }

  filterPages(text) {
    this.filter = text;
    const term = normalized(text.trim()).toLowerCase();
    const dropdown = this.pageDropdown;
    dropdown.selectEl.replaceChildren();
    dropdown.addOption("", this.t("Choose a page"));
    for (const page of this.pages) {
      if (normalized(page.label).toLowerCase().includes(term) || page.id === this.pageId) {
        dropdown.addOption(page.id, page.label);
      }
    }
    dropdown.setValue(this.pageId ?? "");
  }

  async perform(message, task) {
    if (this.busy) return;
    this.busy = true;
    this.status = this.t(message);
    this.render();
    try {
      await this.plugin.withConnection(task);
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  loadPages() {
    return this.perform("Loading Confluence pages…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      this.pages = Array.from(remote.trails, ([id, trail]) => ({
        id, label: trail.map(node => node.title).join(" / "),
      })).sort((a, b) => a.label.localeCompare(b.label));
      if (!remote.pages.has(this.pageId)) {
        this.pageId = "";
        this.versions = [];
        this.difference = null;
        this.review = null;
      }
      this.status = this.t("{folder} · {count} pages", { folder: folder.title, count: this.pages.length });
    });
  }

  selected(message, task) {
    const id = this.pageId;
    return this.perform(message, async ({ client, profile }) => {
      const remote = await remotePages(client, await client.catalog());
      const page = remote.pages.get(id);
      if (!page) throw new Error("The selected page is no longer in this Confluence folder.");
      await task(client, page, profile);
    });
  }

  loadVersions() {
    return this.selected("Loading page versions…", async (client, page) => {
      const current = page.version;
      const versions = new Map([[current.number, current]]);
      for (const entry of await client.pageVersions(page.id)) {
        if (Number.isInteger(entry.number) && entry.number > 0) versions.set(entry.number, entry);
      }
      this.versions = Array.from(versions.values()).sort((a, b) => b.number - a.number);
      this.after = this.versions[0].number;
      this.before = this.versions[1]?.number;
      this.difference = null;
      this.status = this.t("{title} · {count} available versions", { title: page.title, count: this.versions.length });
    });
  }

  compareVersions() {
    const before = this.before;
    const after = this.after;
    return this.selected("Comparing page versions…", async (client, page) => {
      if (before === after) throw new Error("Choose two different versions.");
      const url = client.pageUrl(page.id);
      const [oldBody, newBody] = await Promise.all([checkedBody(client, page, before), checkedBody(client, page, after)]);
      const diff = diffLines(fromStorage(oldBody, url), fromStorage(newBody, url));
      this.difference = { title: page.title + " · v" + before + " → v" + after,
        text: diff || this.t("No converted Markdown body difference.") };
      this.status = this.t("Version comparison complete.");
    });
  }

  loadReview() {
    return this.selected("Finding changes that match the local note…", async (client, page, profile) => {
      this.review = null;
      this.backup = null;
      this.review = await prepareLocalReview(this.app, client, profile, page);
      this.selection = new Set();
      const total = this.review.hunks.length;
      const available = this.review.hunks.filter(hunk => hunk.at !== null).length;
      this.status = total ? this.t("{available} of {total} changes match the local note.", { available, total }) :
        this.t("No incoming body changes.");
    });
  }

  resolveConflict() {
    return this.selected("Loading conflict versions…", async (client, page, profile) => {
      const review = await prepareConflict(this.app, client, profile, page);
      if (!this.opened) return;
      this.close();
      new ConflictModal(this.plugin, review).open();
    });
  }

  applyReview() {
    const review = this.review;
    const selection = Array.from(this.selection);
    return this.selected("Checking the selected changes…", async (client, page, profile) => {
      if (!this.opened) return;
      const approved = await this.plugin.confirm(this.t("Apply selected changes"),
        this.t("Apply {count} changes to {path}? A backup will be saved first.", { count: selection.length, path: review.path }),
        this.t("Apply changes"));
      if (!approved || !this.opened) {
        this.status = this.t("Application cancelled.");
        return;
      }
      const result = await applyLocalReview(this.app, client, profile, page, review, selection);
      this.review = null;
      this.selection = new Set();
      this.backup = result.backup;
      this.status = this.t("{count} changes applied to the local note.", { count: result.count });
    });
  }

  saveSnapshot(id) {
    return this.perform("Preparing the current Confluence snapshot…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      if (!this.opened) return;
      if (!id) {
        if (!remote.pages.size) throw new Error("The selected folder contains no pages.");
        const approved = await this.plugin.confirm(
          this.t("Download Confluence snapshot"),
          this.t("Save the current versions of {count} pages from {folder} in a new snapshot under {inbox}?",
            { count: remote.pages.size, folder: folder.title, inbox: client.config.inbox }),
          this.t("Download snapshot"),
        );
        if (!approved || !this.opened) {
          this.status = this.t("Snapshot cancelled.");
          return;
        }
      }
      const result = await downloadSnapshot(this.app.vault, client, remote, id);
      this.status = result.summary;
      await this.app.workspace.getLeaf("tab").openFile(result.file);
      if (this.opened) this.close();
      new Notice(result.summary);
    });
  }
}

const DEFAULT_SETTINGS = {
  folderUrl: "", source: "Confluence source", inbox: "Confluence inbox",
  email: "", secretId: "", allowPublish: false, language: "auto",
};

class Confirmation extends Modal {
  constructor(app, title, summary, buttonLabel, cancelLabel, accept) {
    super(app);
    this.title = title;
    this.summary = summary;
    this.buttonLabel = buttonLabel;
    this.cancelLabel = cancelLabel;
    this.accept = accept;
    this.confirmed = false;
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.summary });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(this.cancelLabel).onClick(() => this.close()))
      .addButton(button => button.setButtonText(this.buttonLabel).setCta().onClick(() => {
        this.confirmed = true;
        this.close();
      }));
  }

  onClose() {
    this.contentEl.empty();
    this.accept(this.confirmed);
  }
}

class SyncSettings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl, plugin } = this;
    containerEl.empty();
    const settings = plugin.data.settings;
    const t = (message, values) => plugin.t(message, values);
    new Setting(containerEl).setName(t("Language"))
      .setDesc(t("Follow Obsidian or choose the language for this plugin."))
      .addDropdown(dropdown => dropdown.addOption("auto", t("Follow Obsidian"))
        .addOption("en", "English").addOption("ko", "한국어").setValue(settings.language)
        .onChange(async value => {
          await plugin.configure("language", value);
          this.display();
        }));
    const text = (name, description, property, placeholder) => {
      new Setting(containerEl).setName(t(name)).setDesc(t(description)).addText(field => {
        field.setValue(settings[property]).setPlaceholder(placeholder).onChange(value => plugin.configure(property, value));
      });
    };
    text("Confluence folder URL", "Copy the URL of a folder from the Confluence sidebar.", "folderUrl", "https://example.atlassian.net/wiki/spaces/DOC/folder/1234");
    text("Atlassian email", "Use the account that issued the Confluence Cloud token.", "email", "name@example.com");
    new Setting(containerEl).setName(t("Confluence API token")).setDesc(t("Select a scoped Atlassian API token stored in Obsidian."))
      .addComponent(el => new SecretComponent(plugin.app, el).setValue(settings.secretId)
        .onChange(value => plugin.configure("secretId", value ?? "")));
    text("Source vault folder", "Publish only notes and referenced files from this folder.", "source", "Project");
    text("Import vault folder", "Save previews and imported copies in a separate folder.", "inbox", "Confluence inbox");
    new Setting(containerEl).setName(t("Enable publish")).setDesc(t("Allow explicit, confirmed uploads from this vault."))
      .addToggle(toggle => toggle.setValue(settings.allowPublish).onChange(value => plugin.configure("allowPublish", value)));
    new Setting(containerEl).setName(t("Connection")).addButton(button => button.setButtonText(t("Test connection"))
      .onClick(() => plugin.run("connect")));
  }
}

class ConfluenceFolderSync extends Plugin {
  async onload() {
    const stored = await this.loadData() ?? {};
    this.data = { settings: { ...DEFAULT_SETTINGS, ...stored.settings }, profiles: stored.profiles ?? {} };
    this.saving = Promise.resolve();
    this.addSettingTab(new SyncSettings(this));
    const openDashboard = () => new SyncDashboard(this).open();
    this.ribbon = this.addRibbonIcon("arrow-right-left", this.t("Open Confluence sync dashboard"), openDashboard);
    this.commandDefinitions = [
      { id: "dashboard", name: "Open sync dashboard", callback: openDashboard },
      { id: "publish", name: "Publish vault folder to Confluence", callback: () => this.run("publish") },
      { id: "preview", name: "Preview Confluence changes", callback: () => this.run("preview") },
      { id: "import", name: "Import new Confluence pages", callback: () => this.run("import") },
    ];
    this.registerCommands();
  }

  get language() {
    return syncLanguage(this.data.settings.language, typeof getLanguage === "function" ? getLanguage() : "en");
  }

  t(message, values) {
    return translate(this.language, message, values);
  }

  registerCommands() {
    for (const command of this.commandDefinitions) {
      if (this.commandsRegistered) this.removeCommand(command.id);
      this.addCommand({ ...command, name: this.t(command.name) });
    }
    this.commandsRegistered = true;
    this.ribbon.setAttribute("aria-label", this.t("Open Confluence sync dashboard"));
  }

  persist() {
    const snapshot = structuredClone(this.data);
    const saved = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    this.saving = saved;
    return saved;
  }

  async configure(key, value) {
    this.data.settings[key] = value;
    try {
      await this.persist();
      if (key === "language") this.registerCommands();
    } catch {
      new Notice(this.t("Confluence Folder Sync could not save the settings."));
    }
  }

  confirm(title, summary, button) {
    return new Promise(resolve => new Confirmation(this.app, title, summary, button, this.t("Cancel"), resolve).open());
  }

  async withConnection(task) {
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    this.running = true;
    try {
      await this.saving;
      const config = validatedConfig({ ...this.data.settings, language: this.language });
      const token = this.app.secretStorage.getSecret(config.secretId);
      if (!token) throw new Error("Choose a valid token in the plugin settings.");
      const client = new ConfluenceCloud(config, token);
      const folder = await client.connect();
      const key = JSON.stringify([config.origin, config.folderId, config.source]);
      const profile = this.data.profiles[key] ??= { folders: {}, pages: {}, imports: {} };
      return await task({ client, folder, config, profile, save: () => this.persist() });
    } finally {
      this.running = false;
    }
  }

  preparePublication() {
    return this.withConnection(async ({ client, profile }) => {
      const tree = await preparedNotes(this.app, client.config);
      return publicationReview(this.app, client, profile, tree, await client.catalog());
    });
  }

  async run(action) {
    const progress = new Notice(this.t("Connecting to Confluence…"), 0);
    try {
      await this.withConnection(async ({ client, folder, config, profile, save }) => {
        if (action === "connect") {
          new Notice(this.t("Connected to Confluence folder {title} ({id}).", { title: folder.title, id: config.folderId }));
          return;
        }
        const catalog = await client.catalog();
        if (action !== "publish") {
          const result = await incoming(this.app, client, catalog, profile, save, action === "import");
          await this.app.workspace.getLeaf("tab").openFile(result.file);
          new Notice(result.summary);
          return;
        }
        const tree = await preparedNotes(this.app, config);
        const review = await publicationReview(this.app, client, profile, tree, catalog);
        new PublicationModal(this, review).open();
      });
    } catch (error) {
      const message = localizedError(error, this.language);
      new Notice("Confluence Folder Sync: " + message, 12000);
    } finally {
      progress.hide();
    }
  }
}

module.exports = ConfluenceFolderSync;
