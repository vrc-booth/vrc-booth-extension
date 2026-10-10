export type ReviewProduct = {
  id: string;
  title: string;
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

export type ReviewImage = {
  id: string;
  url: string;
  width: number;
  height: number;
};

export type CommentItem = {
  id: string;
  content: string;
  score: number;
  language?: string;
  blinded?: boolean;
  images?: ReviewImage[];
  upvotes?: number;
  downvotes?: number;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    anonymous?: boolean;
    deactivated?: boolean;
  };
};

export type UserSummary = {
  id: string;
  username: string;
};

export type UserProfile = UserSummary & {
  discord: string;
  adult: boolean;
  autoCollapse: boolean;
  admin: boolean;
  bio: string;
};

export type MyCommentData = {
  images?: ReviewImage[];
  anonymous?: boolean;
  blinded?: boolean;
  id: string;
  content: string;
  score: number;
};

export type AuthToken = {
  /** Local login generation; never sent to the API. */
  sessionId?: string;
  accessToken: string;
  refreshToken: string;
}
