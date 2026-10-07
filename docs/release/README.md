# 릴리스 준비와 복구

현재 `3.3.0`은 **미배포 로컬 후보**다. `v3.3.0`은 제안 태그일 뿐 만들지 않았다. #30/#31/#32를 연결하며, 실제 게시·서명·OAuth 설정 변경은 별도 승인 대상이다.

## 고정 입력과 검증

Node.js 24.19.0, packageManager의 pnpm 11.19.0, 커밋된 lockfile을 사용한다. pnpm-workspace.yaml은 잠긴 esbuild 설치 스크립트만 허용한다. Python 3.12는 ZIP 내용 검사와 메타데이터 정규화에 사용한다.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:release
pnpm compile
pnpm build
pnpm build:firefox
pnpm release:package
pnpm release:verify
```

산출물은 `boothplus-3.3.0-chrome.zip`, `boothplus-3.3.0-firefox.zip`, `boothplus-3.3.0-sources.zip`이다. `dist/release-manifest.json`에 커밋·작업 트리 상태·버전·해시·배포 차단 항목을 기록하고 `dist/SHA256SUMS`와 함께 검토한다. WXT ZIP의 시간/순서를 정규화하되 도구나 플랫폼이 다른 빌드까지 비트 단위로 같다고 보장하지 않는다.

## CI와 수동 준비

- main/dev PR과 push는 검사·타입·양쪽 빌드·정확한 ZIP 내용 일치를 확인한다.
- PR을 병합하지 않고 닫는 것만으로 실행되는 공개 릴리스 경로를 제거했다.
- 수동 준비는 main에서 정확한 40자리 후보 SHA와 버전, 해당 SHA의 실제 브라우저 QA 기록을 요구한다. 후보는 main 이력에 포함되어야 하며 작업 트리가 깨끗해야 한다.
- 예제 `qa-record.example.json`은 의도적으로 미완료다. 검사하지 않은 시나리오를 passed로 바꾸지 않는다. 실제 브라우저 버전·확장 ID·관찰한 OAuth 반환 주소·증거 링크를 기록한다.
- prefixed `v3.3.0`과 bare `3.3.0` 태그 중 하나라도 있으면 새 태그를 덮어쓰지 않는다.
- 권한은 contents:read이며, upload-artifact로 후보 파일만 보관한다. GitHub Release 생성·tag push·Chrome Web Store·AMO 게시 동작은 없다.

## 신원·권한·업데이트

Chrome의 기존 공개 키는 유지하며 계산된 ID는 `hafbafjoecfjdlhjilpakabocglkaegj`다. 관찰해야 할 반환 주소는 `https://hafbafjoecfjdlhjilpakabocglkaegj.chromiumapp.org/`이다. 실제 Discord 등록 여부를 확인한 것은 아니다.

Firefox에는 Chrome의 key/sidePanel 권한을 넣지 않는다. 계정 설정은 account.html로 열린다. 영구 Gecko ID를 임의로 만들지 않았다. 게시자가 ID를 결정하고 해당 ID의 identity.getRedirectURL() 결과를 실제로 확인하여 Discord 등록·AMO 고지·서명을 완료해야 한다. [Mozilla 설명](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/getRedirectURL)에 따르면 임시 설치 ID가 바뀌면 반환 주소도 바뀐다.

기존 local:authToken 키와 accessToken/refreshToken 쌍을 유지한다. 새 sessionId 필드는 선택적이며 옛 토큰 쌍을 지우는 마이그레이션은 없다. 자동 검사는 이전 형식과 모듈 재로드를 확인했지만 실제 브라우저 재시작/확장 업데이트 검사는 #31에서 해야 한다. 제거된 프로필 옵션은 서버에도 저장되지 않으므로 값을 복구하거나 새 저장소로 이전하지 않는다. 칩 숨김 키는 기존 PR #29 형식을 유지한다.

## 승인된 게시 전 체크

1. #30의 최종 통합 커밋을 검토·원격 반영한 뒤 동일 SHA를 후보로 고정
2. #31 실제 설치·OAuth·다중 탭·재시작·리뷰 CRUD·ko/en/ja·구매 영역 비가림·업데이트 검증 완료
3. Firefox 영구 ID/반환 주소/수집 고지/서명 차단 항목 해소
4. 깨끗한 동일 커밋에서 다시 패키징하고 해시·QA 기록 검토
5. 별도 게시 승인을 받은 뒤에만 GitHub Release/스토어 제출 진행

## 복구

배포 전에 게시자가 **실제로 배포된 정상 버전**의 서명 패키지·태그·확장 ID·스토어 버전·SHA256을 별도로 보관한다. 소스의 3.2.0을 운영에 배포된 정상 버전이라고 가정하지 않는다. 읽은 GitHub 릴리스 목록에는 과거 2.1.0만 확인되었으므로 현재 스토어 설치 버전은 별도 확인 대상이다.

오류 시 진행 중 게시를 중지하고 영향을 기록한다. 테스트 프로필에서 보관한 정상 패키지의 재설치를 먼저 확인한다. 스토어는 단순 버전 다운그레이드가 되지 않을 수 있으므로 기존 정상 코드를 더 높은 수정 버전으로 재게시하는 계획을 게시자와 승인한다. 확장 ID를 바꾸거나 사용자 토큰을 일괄 삭제하지 않는다. 실제 복구·재게시도 별도 승인 후 수행한다.


## Chrome 전용 승인형 자동화 코드

[Chrome Web Store 자동화 설계와 활성화 경계](chrome-web-store.md)를 추가했다. 기존 양쪽 브라우저 준비 경로는 그대로 두고, Chrome-only 실제 QA 게이트와 immutable artifact 준비를 분리한다. 별도 수동 제출/승격 workflow 코드는 기본 비활성이며, 설정·환경 승인·정확한 artifact/버전/태그·영속 이력을 모두 확인해야만 진행하도록 작성했다. 실제 서비스 계정/WIF/게시자 연결/변수 설정/제출은 수행하지 않았다.
