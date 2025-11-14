import {
  updateBio,
  updateUserAdult,
  updateUserAutoCollapse,
  updateUserHideAvatar,
  updateUsername,
} from "@/components/review/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useMyCommentsQuery, useUserProfileQuery } from "@/components/review/queries";
import { UserCommentsList } from "@/components/review/components/UserCommentsList";

type Status = {
  message: string;
  variant: "success" | "error";
} | null;

const useAsyncStatusMutation = <TData, TVariables>(
  queryClient: ReturnType<typeof useQueryClient>,
  setStatus: (value: Status) => void,
  mutateFn: (value: TVariables) => Promise<TData>,
  successMessage: string,
  errorMessage: string,
) =>
  useMutation<TData, Error, TVariables>({
    mutationFn: mutateFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      setStatus({ variant: "success", message: successMessage });
    },
    onError: () => {
      setStatus({ variant: "error", message: errorMessage });
    },
  });

function App() {
  const queryClient = useQueryClient();
  const profileQuery = useUserProfileQuery();

  const [formState, setFormState] = useState({
    username: "",
    bio: "",
    adult: false,
    hideAvatar: false,
    autoCollapse: false,
  });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>(null);

  const PAGE_SIZE = 5;
  const commentsQuery = useMyCommentsQuery(page, PAGE_SIZE, {
    enabled: Boolean(profileQuery.data) && page > 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setFormState({
      username: profileQuery.data.username,
      bio: profileQuery.data.bio ?? "",
      adult: profileQuery.data.adult,
      hideAvatar: profileQuery.data.hideAvatar,
      autoCollapse: profileQuery.data.autoCollapse,
    });
    setPage(1);
  }, [profileQuery.data]);

  const adultMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateUserAdult,
    "성인 콘텐츠 설정이 저장되었습니다.",
    "성인 콘텐츠 설정 저장에 실패했습니다.",
  );
  const autoCollapseMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateUserAutoCollapse,
    "자동 접기 설정이 저장되었습니다.",
    "자동 접기 설정 저장에 실패했습니다.",
  );
  const hideAvatarMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateUserHideAvatar,
    "아바타 숨김 설정이 저장되었습니다.",
    "아바타 숨김 설정 저장에 실패했습니다.",
  );
  const usernameMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateUsername,
    "사용자명이 저장되었습니다.",
    "사용자명 저장에 실패했습니다.",
  );
  const bioMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateBio,
    "소개글이 저장되었습니다.",
    "소개글 저장에 실패했습니다.",
  );

  const handleToggle = (field: "adult" | "hideAvatar" | "autoCollapse", value: boolean) => {
    setFormState((previous) => ({ ...previous, [field]: value }));

    switch (field) {
      case "adult":
        adultMutation.mutate(value);
        break;
      case "hideAvatar":
        hideAvatarMutation.mutate(value);
        break;
      case "autoCollapse":
        autoCollapseMutation.mutate(value);
        break;
    }
  };

  const handleUsernameSave = () => {
    if (!formState.username.trim()) {
      setStatus({ variant: "error", message: "사용자명을 입력해주세요." });
      return;
    }
    usernameMutation.mutate(formState.username.trim());
  };

  const handleBioSave = () => {
    bioMutation.mutate(formState.bio);
  };

  if (profileQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        사용자 정보를 불러오는 중입니다…
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="p-6 text-sm text-slate-500">
        리뷰 관리 패널에 로그인되어 있지 않습니다. 먼저 리뷰 페이지에서 로그인을 완료해 주세요.
        <div className="mt-3">
          <button
            type="button"
            className="rounded-2xl bg-[#fc4d50] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            onClick={() => profileQuery.refetch()}
            disabled={profileQuery.isFetching}
          >
            로그인 상태 다시 확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">사용자 관리</h1>
          <p className="mt-1 text-xs text-slate-500">현재 로그인한 사용자의 프로필과 설정을 관리합니다.</p>
          {status && (
            <p
              className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                status.variant === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              }`}
            >
              {status.message}
            </p>
          )}
          <dl className="mt-4 space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-slate-500">유저 ID</dt>
              <dd className="font-semibold text-slate-900">{profileQuery.data.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">디스코드</dt>
              <dd className="font-semibold text-slate-900">{profileQuery.data.discord}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">관리자 권한</dt>
              <dd className="font-semibold text-slate-900">{profileQuery.data.admin ? "예" : "아니오"}</dd>
            </div>
          </dl>
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">기본 설정</h2>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-700">성인 콘텐츠 허용</span>
            <label className="relative inline-flex justify-center cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={formState.adult}
                onChange={(event) => handleToggle("adult", event.target.checked)}
                disabled={adultMutation.isPending}
              />
              <div className="h-5 w-10 rounded-full bg-slate-200 transition peer-checked:bg-[#fc4d50]"></div>
              <span className="absolute inline-flex justify-center text-[10px] uppercase tracking-[0.2em] text-white">
                {formState.adult ? "ON" : "OFF"}
              </span>
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-700">프로필 아바타 숨김</span>
            <label className="relative inline-flex justify-center cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={formState.hideAvatar}
                onChange={(event) => handleToggle("hideAvatar", event.target.checked)}
                disabled={hideAvatarMutation.isPending}
              />
              <div className="h-5 w-10 rounded-full bg-slate-200 transition peer-checked:bg-[#fc4d50]"></div>
              <span className="absolute justify-center align-center text-[10px] uppercase tracking-[0.2em] text-white">
                {formState.hideAvatar ? "ON" : "OFF"}
              </span>
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-700">설명 자동 펼침</span>
            <label className="relative inline-flex justify-center cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={formState.autoCollapse}
                onChange={(event) => handleToggle("autoCollapse", event.target.checked)}
                disabled={autoCollapseMutation.isPending}
              />
              <div className="h-5 w-10 rounded-full bg-slate-200 transition peer-checked:bg-[#fc4d50]"></div>
              <span className="absolute inline-flex justify-center text-[10px] uppercase tracking-[0.2em] text-white">
                {formState.autoCollapse ? "ON" : "OFF"}
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">프로필</h2>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-900"
              disabled={profileQuery.isFetching}
              onClick={() => profileQuery.refetch()}
            >
              다시 불러오기
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="username">
              사용자명
            </label>
            <div className="flex gap-2">
              <input
                id="username"
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#fc4d50]/70 focus:outline-none"
                value={formState.username}
                onChange={(event) => setFormState((previous) => ({ ...previous, username: event.target.value }))}
              />
              <button
                type="button"
                className="rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60"
                onClick={handleUsernameSave}
                disabled={usernameMutation.isPending}
              >
                저장
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="bio">
              소개글
            </label>
            <textarea
              id="bio"
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-[#fc4d50]/70 focus:outline-none"
              value={formState.bio}
              onChange={(event) => setFormState((previous) => ({ ...previous, bio: event.target.value }))}
            />
            <button
              type="button"
              className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60"
              onClick={handleBioSave}
              disabled={bioMutation.isPending}
            >
              저장
            </button>
          </div>
        </section>

        <UserCommentsList
          comments={commentsQuery.data?.comments ?? []}
          count={commentsQuery.data?.count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={commentsQuery.isLoading}
          isFetching={commentsQuery.isFetching}
          onPageChange={setPage}
          onRefresh={() => commentsQuery.refetch()}
        />
      </div>
    </div>
  );
}

export default App;
