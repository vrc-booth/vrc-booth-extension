/** Only the current product's wishlist control, never related product cards. */
export const resolveCommentCountAnchor = (root: ParentNode = document): Element | null => {
  const itemId = window.location.pathname.match(/\/items\/([^/]+)/)?.[1];
  if (!itemId) return null;
  const form = Array.from(root.querySelectorAll<HTMLFormElement>('form[action]')).find((candidate) => {
    try {
      return new URL(candidate.action, window.location.href).pathname === `/items/${itemId}/wish_list`;
    } catch {
      return false;
    }
  });
  const button = form?.parentElement?.querySelector('pixiv-icon[name="24/BoothLikeOff"], pixiv-icon[name="24/BoothLikeOn"]');
  return button?.parentElement?.parentElement ?? null;
};
