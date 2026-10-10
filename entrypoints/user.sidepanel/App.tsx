import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { updateUsername } from "@/components/review/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useMyCommentsQuery, useUserProfileQuery } from "@/components/review/queries";
import { UserCommentsList } from "@/components/review/components/UserCommentsList";
import { i18n } from "#i18n";

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

  const [username, setUsername] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>(null);

  const PAGE_SIZE = COMMENTS_PAGE_SIZE;
  const commentsQuery = useMyCommentsQuery(page, PAGE_SIZE, {
    enabled: Boolean(profileQuery.data) && page > 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setUsername(profileQuery.data.username);
    setPage(1);
  }, [profileQuery.data]);

  const usernameMutation = useAsyncStatusMutation(
    queryClient,
    setStatus,
    updateUsername,
    i18n.t("userPanel.statuses.usernameSaved"),
    i18n.t("userPanel.statuses.usernameError"),
  );
  const handleUsernameSave = () => {
    if (!username.trim()) {
      setStatus({ variant: "error", message: i18n.t("messages.usernameRequired") });
      return;
    }
    usernameMutation.mutate(username.trim());
  };

  if (profileQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {i18n.t("userPanel.loading")}
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {i18n.t("userPanel.notLoggedIn")}
        <div className="mt-3">
          <button
            type="button"
            className="rounded-2xl bg-[#fc4d50] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            onClick={() => profileQuery.refetch()}
            disabled={profileQuery.isFetching}
          >
            {i18n.t("userPanel.checkLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{i18n.t("userPanel.title")}</h1>
          <p className="mt-1 text-xs text-slate-500">{i18n.t("userPanel.description")}</p>
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
              <dt className="text-slate-500">{i18n.t("userPanel.labels.userId")}</dt>
              <dd className="font-semibold text-slate-900">{profileQuery.data.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{i18n.t("userPanel.labels.discord")}</dt>
              <dd className="font-semibold text-slate-900">{profileQuery.data.discord}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{i18n.t("userPanel.labels.admin")}</dt>
              <dd className="font-semibold text-slate-900">
                {profileQuery.data.admin ? i18n.t("userPanel.adminValue.yes") : i18n.t("userPanel.adminValue.no")}
              </dd>
            </div>
          </dl>
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{i18n.t("userPanel.sections.profile")}</h2>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-900"
              disabled={profileQuery.isFetching}
              onClick={() => profileQuery.refetch()}
            >
              {i18n.t("userPanel.profileFields.refresh")}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="username">
              {i18n.t("userPanel.profileFields.username")}
            </label>
            <div className="flex gap-2">
              <input
                id="username"
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#fc4d50]/70 focus:outline-none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <button
                type="button"
                className="rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60"
                onClick={handleUsernameSave}
                disabled={usernameMutation.isPending}
              >
                {i18n.t("userPanel.profileFields.save")}
              </button>
            </div>
          </div>

          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            {i18n.t("userPanel.retiredSettings")}
          </p>
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
