import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { updateUsername } from "@/components/review/api";
import { PRIMARY_BUTTON_CLASS, SMALL_PRIMARY_BUTTON_CLASS } from "@/components/ui/buttons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { useMyCommentsQuery, useUserProfileQuery } from "@/components/review/queries";
import { UserCommentsList } from "@/components/review/components/UserCommentsList";
import { i18n } from "#i18n";

type Status = {
  message: string;
  variant: "success" | "error";
} | null;

function App() {
  const queryClient = useQueryClient();
  const profileQuery = useUserProfileQuery();

  const [username, setUsername] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>(null);

  const commentsQuery = useMyCommentsQuery(page, COMMENTS_PAGE_SIZE, {
    enabled: Boolean(profileQuery.data) && page > 0,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setUsername(profileQuery.data.username);
    setPage(1);
  }, [profileQuery.data]);

  const usernameMutation = useMutation<void, Error, string>({
    mutationFn: updateUsername,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      setStatus({ variant: "success", message: i18n.t("userPanel.statuses.usernameSaved") });
    },
    onError: () => {
      setStatus({ variant: "error", message: i18n.t("userPanel.statuses.usernameError") });
    },
  });
  const handleUsernameSave = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!username.trim()) {
      setStatus({ variant: "error", message: i18n.t("messages.usernameRequired") });
      return;
    }
    usernameMutation.mutate(username.trim());
  };

  if (profileQuery.isPending) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {i18n.t("userPanel.loading")}
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {i18n.t(profileQuery.isError ? "reviewBoard.sessionUnavailable" : "userPanel.notLoggedIn")}
        <div className="mt-3">
          <button
            type="button"
            className={SMALL_PRIMARY_BUTTON_CLASS}
            onClick={() => profileQuery.refetch()}
            disabled={profileQuery.isFetching}
          >
            {i18n.t("userPanel.checkLogin")}
          </button>
        </div>
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            {i18n.t("userPanel.title")}
            {profile.admin && (
              <span className="ml-2 rounded-full bg-[#fc4d50]/10 px-2 py-0.5 align-middle text-[11px] font-semibold text-[#fc4d50]">
                {i18n.t("userPanel.labels.admin")}
              </span>
            )}
          </h1>
          <dl className="mt-4 space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-slate-500">{i18n.t("userPanel.labels.userId")}</dt>
              <dd className="font-semibold text-slate-900">{profile.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{i18n.t("userPanel.labels.discord")}</dt>
              <dd className="font-semibold text-slate-900">{profile.discord}</dd>
            </div>
          </dl>
        </div>

        <form className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" onSubmit={handleUsernameSave}>
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
            <button type="submit" className={`${PRIMARY_BUTTON_CLASS} px-3 text-xs`} disabled={usernameMutation.isPending}>
              {i18n.t("userPanel.profileFields.save")}
            </button>
          </div>
          {status && (
            <p
              role="status"
              className={`rounded-xl px-3 py-2 text-xs ${
                status.variant === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              }`}
            >
              {status.message}
            </p>
          )}
        </form>

        <UserCommentsList
          comments={commentsQuery.data?.comments ?? []}
          count={commentsQuery.data?.count ?? 0}
          page={page}
          pageSize={COMMENTS_PAGE_SIZE}
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
