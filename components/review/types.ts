export type ReviewProduct = {
  id: string;
  title: string;
  price: string;
  url: string;
  score: number;
  thumbnails: string[];
  category: string;
  shop: {
    id: string;
    name: string;
    url: string;
    avatar: string;
  };
};

/** `GET /api/comment` 가 받는 정렬 값이다. */
export type CommentSort = "new" | "old" | "score_asc" | "score_desc";

export type CommentItem = {
  id: string;
  content: string;
  score: number;
  language?: string;
  upvotes?: number;
  downvotes?: number;
  updatedAt: string;
  user: {
    id: string;
    username: string;
  };
};

export type UserSummary = {
  id: string;
  username: string;
};

export type UserProfile = UserSummary & {
  discord: string;
  adult: boolean;
  hideAvatar: boolean;
  autoCollapse: boolean;
  admin: boolean;
  bio: string;
};

export type MyCommentData = {
  id: string;
  content: string;
  score: number;
};

export type AuthToken = {
  accessToken: string;
  refreshToken: string;
}
