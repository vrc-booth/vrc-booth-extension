import "@/assets/tailwind.css";
import "./preview.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ReviewBoard } from "@/components/ReviewBoard";
import AccountPanel from "@/entrypoints/user.sidepanel/App";
import { REVIEW_TOAST_CONTAINER_ID } from "@/utils/toast";
import { ACCOUNT_EVENT, PREVIEW_EVENT, resetScenario, state, type PreviewScenario } from "./mocks/state";
import { setLocale, type PreviewLocale } from "./mocks/i18n";
import { installPreviewNetworkGuard } from "./network";

installPreviewNetworkGuard();
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const scenarios: Array<{ id: PreviewScenario; title: string; description: string }> = [
  { id: "signed-out", title: "로그아웃 · Reviews", description: "로그인 안내와 실제 리뷰 컴포넌트를 확인하세요" },
  { id: "signed-in", title: "로그인 · Write", description: "평점 선택, 댓글 작성·수정·삭제를 로컬에서 시험하세요" },
  { id: "account", title: "계정 · Account", description: "사용자명 저장과 나의 댓글 페이지 이동을 확인하세요" },
  { id: "empty", title: "빈 상태 · Empty", description: "리뷰가 없는 상품의 첫 댓글 작성 상태를 확인하세요" },
];
const initialScenario = new URLSearchParams(window.location.search).get("state");
const selectedScenario = scenarios.some(({ id }) => id === initialScenario) ? initialScenario as PreviewScenario : "signed-out";
resetScenario(selectedScenario);

function Preview() {
  const [scenario, setScenario] = useState<PreviewScenario>(selectedScenario);
  const [locale, updateLocale] = useState<PreviewLocale>("ko");
  const [signedIn, setSignedIn] = useState(state.signedIn);
  const [revision, setRevision] = useState(0);
  const [accountVisible, setAccountVisible] = useState(selectedScenario === "account");

  useEffect(() => {
    const update = () => setSignedIn(state.signedIn);
    const openAccount = () => setAccountVisible(true);
    window.addEventListener(PREVIEW_EVENT, update);
    window.addEventListener(ACCOUNT_EVENT, openAccount);
    return () => {
      window.removeEventListener(PREVIEW_EVENT, update);
      window.removeEventListener(ACCOUNT_EVENT, openAccount);
    };
  }, []);

  const chooseScenario = (next: PreviewScenario) => {
    resetScenario(next);
    queryClient.clear();
    setScenario(next);
    setAccountVisible(next === "account");
    setRevision((value) => value + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("state", next);
    window.history.replaceState({}, "", url);
  };
  const changeLocale = (value: PreviewLocale) => {
    setLocale(value);
    updateLocale(value);
    setRevision((current) => current + 1);
  };

  return (
    <div className="preview-shell">
      <header className="preview-header">
        <div className="preview-wordmark"><span aria-hidden="true" className="preview-logo">B<span>+</span></span><div>BoothPlus<p>LOCAL DESIGN PREVIEW</p></div></div>
        <span className="preview-local-badge"><span /> 합성 데이터 · SIMULATED</span>
      </header>
      <main className="preview-main">
        <section className="preview-intro">
          <p className="preview-eyebrow">EXTENSION WORKSPACE / 01</p>
          <h1>리뷰를 더 편하게,<br /><span>계정 관리는 더 명확하게.</span></h1>
          <p className="preview-subtitle">실제 확장 프로그램 화면을 로컬에서 살펴보세요. 모든 사용자·상품·리뷰는 예시이며, 로그인과 저장은 이 페이지 안에서만 작동합니다.</p>
        </section>
        <section className="preview-controls" aria-label="Preview controls">
          <div className="preview-tabs" role="tablist" aria-label="Preview scenario">
            {scenarios.map(({ id, title }) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={scenario === id} aria-controls="preview-content" onClick={() => chooseScenario(id)}>{title}</button>)}
          </div>
          <label className="preview-language">언어 <select aria-label="UI language" value={locale} onChange={(event) => changeLocale(event.target.value as PreviewLocale)}><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option></select></label>
        </section>
        <div className="preview-stage-top"><p>{scenarios.find(({ id }) => id === scenario)?.description}</p><button onClick={() => chooseScenario(scenario)}>예시 초기화 ↺</button></div>
        <div id="preview-content" role="tabpanel" aria-labelledby={`tab-${scenario}`} className={`preview-stage ${accountVisible ? "is-account" : ""}`}>
          <div className="preview-surface-label"><span>{accountVisible ? "실제 사이드 패널 · Account settings" : "실제 콘텐츠 화면 · Review board"}</span><span>{signedIn ? "● Simulated signed in" : "○ Signed out"}</span></div>
          <QueryClientProvider client={queryClient}>
            <div key={`${revision}-${accountVisible}`} className={accountVisible ? "preview-account" : "preview-board"}>
              {accountVisible ? <AccountPanel /> : <ReviewBoard />}
            </div>
            <ToastContainer containerId={REVIEW_TOAST_CONTAINER_ID} position="bottom-right" />
          </QueryClientProvider>
          {accountVisible && scenario !== "account" && <button className="preview-back" onClick={() => setAccountVisible(false)}>← 리뷰로 돌아가기 · Back to reviews</button>}
        </div>
        <aside className="preview-note"><span aria-hidden="true">◎</span><div><strong>안전한 로컬 미리보기</strong><p>실제 React 컴포넌트 + 예시 API입니다. 외부 서비스에 요청하거나 정보를 저장하지 않습니다. 새로고침하면 변경 내용이 초기화됩니다.</p></div></aside>
      </main>
      <footer className="preview-footer">BoothPlus <span>Made for a more thoughtful purchase.</span><span>Local preview · Synthetic data</span></footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
