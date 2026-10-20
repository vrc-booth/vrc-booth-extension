import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const reviewBoard = readSource("components/ReviewBoard.tsx");
const userPanel = readSource("entrypoints/user.sidepanel/App.tsx");
const userComments = readSource("components/review/components/UserCommentsList.tsx");

// Source-level contract checks complement the mocked API tests. They do not
// replace interactive extension QA or make requests to the live service.
describe("legacy-compatible review UI", () => {
  it("does not expose the retired voting or avatar endpoints", () => {
    expect(reviewBoard).not.toMatch(/upvoteComment|downvoteComment|voteMutation|handleVote/);
    expect(reviewBoard).not.toMatch(/comment\.(upvotes|downvotes)|reviewBoard\.vote|\/user\/avatar\//);
    expect(reviewBoard).not.toContain('h-10 w-10');
    expect(readSource("components/review/types.ts")).not.toContain("hideAvatar");
    expect(existsSync(fileURLToPath(new URL("../public/no_profile.png", import.meta.url)))).toBe(false);
    expect(reviewBoard).toContain("submitComment");
    expect(reviewBoard).toContain("deleteComment");
    expect(reviewBoard).toContain("handleLogin");
  });

  it("keeps username editing without showing nonpersistent profile controls", () => {
    expect(userPanel).toContain("updateUsername");
    expect(userPanel).toContain('id="username"');
    expect(userPanel).toContain("handleUsernameSave");
    expect(userPanel).toContain("<UserCommentsList");
    expect(userPanel).toContain('i18n.t("userPanel.retiredSettings")');
    expect(userPanel).not.toMatch(/updateBio|updateUserAdult|updateUserAutoCollapse|updateUserHideAvatar/);
    expect(userPanel).not.toMatch(/type="checkbox"|id="bio"|bioSaved|adultSaved/);
  });

  it("shows and enforces the 500-character review limit before writing", () => {
    expect(reviewBoard).toContain("const MAX_COMMENT_LENGTH = 500;");
    expect(reviewBoard).toContain("maxLength={MAX_COMMENT_LENGTH}");
    expect(reviewBoard).toContain('aria-describedby="review-content-count"');
    expect(reviewBoard).toContain('i18n.t("reviewBoard.characterCount", [formState.content.length, MAX_COMMENT_LENGTH])');
    const validation = reviewBoard.indexOf("if (trimmed.length > MAX_COMMENT_LENGTH)");
    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(reviewBoard.indexOf("submitMutation.mutate({"));
    expect(reviewBoard.slice(validation, reviewBoard.indexOf("submitMutation.mutate({")))
      .toContain('showErrorToast(i18n.t("messages.contentTooLong", [MAX_COMMENT_LENGTH]));\n      return;');
  });

  it("refreshes shared product, public and private review caches after writes", () => {
    expect(reviewBoard).toContain('queryClient.invalidateQueries({ queryKey: ["product"] })');
    expect(reviewBoard).toContain('queryClient.invalidateQueries({ queryKey: ["myComments"] })');
    expect(reviewBoard.match(/await refreshReviewData\(variables.productId\)/g)).toHaveLength(2);
  });

  it("offers account settings for the verified forbidden response", () => {
    expect(reviewBoard).toContain("error.status !== 403");
    expect(reviewBoard).toContain('JSON.parse(error.message)?.message === "forbidden"');
    expect(reviewBoard).toContain('sendMessage("openAccountSettings", undefined)');
    expect(reviewBoard).toContain('i18n.t("messages.usernameSetupHint")');
    expect(reviewBoard).toContain('role="status"');
  });

  it("passes count placeholders as substitution arrays", () => {
    expect(reviewBoard).toContain('i18n.t("reviewBoard.commentsCount", [commentCount])');
    expect(userComments).toContain('i18n.t("userComments.total", [count])');
  });

  it.each(["en", "ko", "ja"])("localizes the supported state in %s", (locale) => {
    const source = readSource(`locales/${locale}.yml`);
    expect(source).toMatch(/^  retiredSettings: .+$/m);
    expect(source).toMatch(/^  usernameSetupHint: .+$/m);
    expect(source).toMatch(/^  accountSettingsError: .+$/m);
    expect(source).toMatch(/^  contentTooLong: .*\$1.*$/m);
    expect(source).toMatch(/^  characterCount: .*\$1.*\$2.*$/m);
    expect(source).toMatch(/^    usernameSaved: .+$/m);
    expect(source).not.toMatch(/^  vote:|^  toggles:|^    (bioSaved|adultSaved|hideAvatarSaved|autoCollapseSaved):/m);
  });
});
