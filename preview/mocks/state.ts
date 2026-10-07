import type { AuthToken, CommentItem, ReviewProduct, UserProfile } from "@/components/review/types";

export type PreviewScenario = "signed-out" | "signed-in" | "account" | "empty";
export const PREVIEW_EVENT = "boothplus:preview-change";
export const ACCOUNT_EVENT = "boothplus:preview-account";
export const MOCK_TOKEN: AuthToken = {
  accessToken: "synthetic-preview-token-not-a-credential",
  refreshToken: "synthetic-preview-refresh-not-a-credential",
};

export const product: ReviewProduct = {
  id: "preview-product",
  title: "새벽빛 니트 · Dawn Knit",
  url: "#synthetic-product",
  score: 9,
  thumbnails: [],
  category: "3D 의상",
  shop: { id: "sample-studio", name: "Sample Studio", url: "#synthetic-shop", avatar: "" },
};
const makeProfile = (): UserProfile => ({
  id: "demo-user-001",
  username: "미리보기 사용자",
  discord: "demo_user (simulated)",
  adult: false,
  hideAvatar: false,
  autoCollapse: false,
  admin: false,
  bio: "Synthetic account for local preview only.",
});
const makeComments = (): CommentItem[] => [
  {
    id: "demo-review-001", content: "색감이 예쁘고 설명서가 이해하기 쉬워요. 다양한 아바타에 맞춰 입혀보기 좋았습니다.",
    score: 9, updatedAt: "2026-10-05T15:20:00Z", user: { id: "sample-user-001", username: "하루 · 예시" },
  },
  {
    id: "demo-review-002", content: "The material presets are lovely. A little adjustment was needed around the sleeves, but the guide helped.",
    score: 8, updatedAt: "2026-10-04T09:30:00Z", user: { id: "sample-user-002", username: "Mika · sample" },
  },
  {
    id: "demo-review-003", content: "シンプルで使いやすいです。テクスチャの雰囲気も気に入りました。", score: 10,
    updatedAt: "2026-10-03T12:15:00Z", user: { id: "sample-user-003", username: "そら · サンプル" },
  },
];

export const state = {
  scenario: "signed-out" as PreviewScenario,
  signedIn: false,
  profile: makeProfile(),
  comments: makeComments(),
  myComments: [] as CommentItem[],
};
export const notify = () => window.dispatchEvent(new Event(PREVIEW_EVENT));
export const setSignedIn = (value: boolean) => {
  state.signedIn = value;
  notify();
};
export const resetScenario = (scenario: PreviewScenario) => {
  state.scenario = scenario;
  state.signedIn = scenario !== "signed-out";
  state.profile = makeProfile();
  state.comments = scenario === "empty" ? [] : makeComments();
  state.myComments = scenario === "account" ? Array.from({ length: 7 }, (_, index) => ({
    id: `demo-my-review-${index + 1}`,
    content: ["색감이 마음에 들어요. 안내에 따라 쉽게 적용했습니다.", "A useful little accessory with clear setup instructions.", "조합하기 쉬운 디자인이라 자주 사용하고 있어요."][index % 3],
    score: [9, 8, 10][index % 3],
    updatedAt: `2026-10-0${7 - index}T10:00:00Z`,
    user: { id: state.profile.id, username: state.profile.username },
  })) : [];
  notify();
};
export const delay = () => new Promise<void>((resolve) => window.setTimeout(resolve, 180));
