# Chrome Web Store 자동화 코드 — 기본 비활성

이 문서는 #31/#32의 남은 릴리스 작업을 위한 코드와 승인 경계를 설명한다. 현재 저장소 변수·보호 환경·Google 서비스 계정·WIF·Chrome 게시자 연결을 만들거나 변경하지 않았다. 태그·심사 제출·게시도 실행하지 않았다.

## 단계

1. **검증/준비**: `prepare-chrome-release.yml`을 main의 정확한 후보 SHA에서 수동 실행한다. 패키지 버전은 `package.json`의 정규 `X.Y.Z`이며 태그는 아직 없어야 한다. 실제 Chrome 설치·OAuth·서비스 워커 재시작·CRUD·업데이트 검사를 같은 SHA에서 완료한 `chrome-qa-record.example.json` 형식의 증거가 필요하다. 예제의 `not_run`은 통과로 간주하지 않는다. Firefox 미완료 설정은 이 Chrome 전용 경로를 막지 않지만 Chrome 검사 항목은 줄이지 않는다.
2. **동결**: 검사를 통과한 동일 SHA에서 Chrome ZIP과 sources ZIP을 한 번 생성한다. GitHub artifact ID/run ID, GitHub가 반환하는 외부 ZIP SHA256, 내부 Chrome ZIP SHA256, 패키지/manifest/변경 기록/QA 버전과 커밋을 묶는다. 보관 기한이 끝난 artifact는 사용하지 않는다.
3. **태그 확인**: 게시 전에는 별도 승인된 `vX.Y.Z` 태그가 정확한 후보 SHA를 가리켜야 한다. 자동화가 태그를 만들거나 덮어쓰지 않는다. 준비 시의 '태그 없음'과 제출/승격 시의 '태그가 정확한 SHA에 존재'는 서로 다른 검사다.
4. **심사 제출**: 별도 활성화와 보호 환경 승인을 거쳐 `chrome-web-store.yml`의 `submit`을 수동 실행한다. 기존 item ID를 직접 확인 입력한다. 동결된 artifact를 다운로드·검증하고 다시 빌드하지 않는다. 동기 업로드 `SUCCEEDED`와 일치하는 item/version을 확인한 경우에만 `STAGED_PUBLISH`, `skipReview:false`, `blockOnWarnings:true`로 제출한다. 승인 후에도 공개하지 않고 STAGED에서 기다린다.
5. **승격**: 동일 artifact/run/SHA를 사용해 별도의 승인된 수동 `promote`를 실행한다. 정확한 후보가 STAGED인 경우만 `DEFAULT_PUBLISH`를 호출한다. 업로드·재빌드·심사 취소·배포 비율 변경은 하지 않는다. 실제 응답 상태가 PUBLISHED인지와 후속 상태를 구분한다.

main push나 PR 병합만으로 Chrome 게시가 실행되는 경로는 없다. 이 코드를 추가했다는 사실은 활성화나 제출 승인이 아니다.

## 엄격한 버전 규칙

- 안정 채널의 유일한 버전 원천은 `package.json`의 숫자 3부분 `X.Y.Z`다. 각 부분은 0~65535, 선행 0/공백/접미사 금지, `0.0.0` 금지다.
- package/생성 manifest/변경 기록/제안 태그/릴리스 메타데이터는 정확히 같아야 한다. 비교는 문자열이 아닌 숫자 튜플이며 Chrome의 과거 1~4부분 버전은 네 번째 0을 보충해 비교한다.
- 호환성을 깨는 변경은 MAJOR, 기능 추가는 MINOR, 작은 버그/보안 수정도 배포한다면 PATCH 이상을 올린다. RC/beta 문자열은 안정 item에 매핑하지 않는다.
- 새 후보는 모든 published/submitted 채널, GitHub release 기록, 기존 숫자 버전 태그, 영속 시도 이력보다 높아야 한다.
- 같은 버전 재실행은 같은 커밋·ZIP digest·준비 artifact/run이 영속 이력으로 증명되고 상태가 허용할 때만 가능하다. 다른 바이트/커밋/artifact로 같은 버전을 재사용하지 않는다.
- 이미 바인딩하거나 제출한 후보를 수정해야 하면 새 PATCH를 만든다. 복구도 과거 코드를 더 높은 PATCH로 재패키징한다. 버전 다운그레이드·태그 덮어쓰기·동일 버전 ZIP 교체는 하지 않는다.

## 활성화 전에 따로 승인할 설정

현재 아래 값은 코드에서 참조할 뿐 설정하지 않았다.

- 기존 Chrome item `hafbafjoecfjdlhjilpakabocglkaegj`와 실제 게시자 ID/현재 스토어 버전 확인
- 게시자에 연결된 Google 서비스 계정과 Chrome Web Store API 권한
- GitHub OIDC/WIF 신뢰를 이 저장소·main·해당 workflow·보호 환경으로 제한
- GitHub `chrome-web-store` Environment에 필수 검토자/적절한 브랜치 정책 설정. 자동 생성된 무보호 환경은 허용하지 않는다. 실제 workflow run의 승인 이력 API를 확인하며 승인 이력이 없으면 토큰 발급 전에 실패한다.
- 저장소 변수 `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`, `CWS_WIF_PROVIDER`, `CWS_SERVICE_ACCOUNT`; 마지막으로 별도 승인 후에만 `CWS_AUTOMATION_ENABLED=true`
- 실제 Chrome QA와 안전한 테스트 계정/데이터 준비

미래 게시 job은 contents/actions 읽기, 버전 시도 원장의 GitHub deployments 쓰기, 짧은 OIDC 토큰 권한만 선언한다. 코드/태그 쓰기 권한은 없다. Google auth action은 SHA로 고정하고, Chrome Web Store 범위의 짧은 토큰만 메모리 환경으로 전달한다. credentials 파일을 생성하거나 source ZIP에 넣지 않는다. 이 권한/신뢰 설정을 실제로 활성화하는 일은 별도 승인 대상이다. 키나 refresh token을 채팅에 넣지 않는다.

## 상태와 재시도

- item 전체에 하나의 동시성 그룹을 사용하고 `cancel-in-progress:false`다. 버전별 병렬 업로드를 하지 않는다.
- GitHub Deployments의 `chrome-web-store-ledger`에 버전/SHA/ZIP digest/artifact/run과 phase를 영속 기록한다. 매 CWS 변경 요청 **전에** phase를 기록하며 이력 읽기/기록 실패 시 중단한다. 만료 가능한 Actions artifact를 시도 원장으로 사용하지 않는다.
- 다른 후보의 PENDING_REVIEW/STAGED는 덮어쓰거나 취소하지 않는다. 경고·삭제·거절·취소·알 수 없는 상태·불완전한 이력은 자동 진행하지 않는다.
- 업로드 응답 유실, IN_PROGRESS 또는 버전/ID 불일치는 exact draft를 증명하지 못하므로 게시하지 않는다. `fetchStatus`에는 draft digest/version이 없다. 나중에 비동기 성공만 보여도 충분한 증거가 아니다.
- 제출/승격 응답이 유실되면 상태를 읽어 확인하고 POST를 반복하지 않는다. `promote_started` 이후 STAGED가 보이는 경우도 stale 응답일 수 있어 수동 조정 대상으로 막는다.
- GitHub의 Re-run 버튼은 사용하지 않는다. run attempt가 1이 아니면 거절하고 새 수동 dispatch와 새 환경 승인을 요구한다. 새 실행도 이력을 읽고 wait/already_done/수동 조정 여부를 결정한다.
- GitHub의 lock은 Developer Dashboard나 다른 클라이언트를 잠그지 못한다. V2에 draft hash/CAS가 없으므로 배포 창에는 이 item의 **단일 작성자** 운영 원칙이 필요하다. 외부에서 draft를 바꿨다면 자동화를 멈추고 명시적으로 조정해야 한다. 상태 버전만으로 바이트 일치를 보장한다고 주장하지 않는다.

## 검사와 남은 조건

`bun run test:cws`는 정책·모의 HTTP·상태 머신·워크플로 안전장치와 Python artifact 공격/불일치 검사를 실행한다. 모든 네트워크 경계는 fixture이며 실제 Chrome Web Store API를 호출하지 않는다. 실제 설치/OAuth QA와 게시자 연결을 확인하기 전에는 활성화할 수 없다. Firefox 게시 절차는 독립적으로 미완료 상태를 유지한다.

참고: [V2 API](https://developer.chrome.com/docs/webstore/api/reference/rest), [fetchStatus](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus), [publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish), [서비스 계정](https://developer.chrome.com/docs/webstore/service-accounts), [GitHub OIDC 인증 action](https://github.com/google-github-actions/auth), [GitHub 환경 승인 이력](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)
