import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { updateUsername } from "@/components/review/api";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui/buttons";
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
      <div className="p-6 text-sm text-booth-sub">
        {i18n.t("userPanel.loading")}
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="p-6 text-sm text-booth-sub">
        <p>{i18n.t(profileQuery.isError ? "reviewBoard.sessionUnavailable" : "userPanel.notLoggedIn")}</p>
        <button
          type="button"
          className={`mt-3 ${SECONDARY_BUTTON_CLASS}`}
          onClick={() => profileQuery.refetch()}
          disabled={profileQuery.isFetching}
        >
          {i18n.t("userPanel.checkLogin")}
        </button>
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="min-h-screen bg-white text-booth-text">
      <div className="mx-auto max-w-lg space-y-6 px-5 py-6">
        <header>
          <h1 className="text-lg font-bold text-booth-heading">{i18n.t("userPanel.title")}</h1>
          <p className="mt-1 text-sm text-booth-sub">
            {i18n.t("userPanel.labels.discord")} {profile.discord} · {i18n.t("userPanel.labels.userId")} {profile.id}
            {profile.admin && (
              <span className="ml-2 rounded-sm border border-booth-border px-1.5 py-0.5 text-xs font-bold text-booth-text">
                {i18n.t("userPanel.labels.admin")}
              </span>
            )}
          </p>
        </header>

        <form className="space-y-2" onSubmit={handleUsernameSave}>
          <label className="block text-xs font-bold text-booth-sub" htmlFor="username">
            {i18n.t("userPanel.profileFields.username")}
          </label>
          <div className="flex gap-2">
            <input
              id="username"
              className="h-10 min-w-0 flex-1 rounded-lg border border-booth-border px-3 text-sm text-booth-text transition focus:border-booth-sub focus:outline-none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <button type="submit" className={`shrink-0 ${PRIMARY_BUTTON_CLASS}`} disabled={usernameMutation.isPending}>
              {i18n.t("userPanel.profileFields.save")}
            </button>
          </div>
          {status && (
            <p role="status" className={`text-xs ${status.variant === "success" ? "text-booth-sub" : "text-booth-primary"}`}>
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
