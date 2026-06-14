import { useEffect, useMemo, useState } from "react";
import { type DocumentData, type QueryDocumentSnapshot } from "@firebase/firestore";
import { FirebaseError } from "@firebase/app";
import toast from "react-hot-toast";
import { MessageCircle, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/Card";
import {
  CUITER_MAX_CHARS,
  canPostOnCuiter,
  createCuiterPost,
  fetchCuiterPostsPage,
  getCuiterAvailableCredits,
} from "../services/cuiterService";
import type { AppUser, CuiterPost } from "../types";
import { formatTimeAgo } from "../utils/date";
import { countGraphemes, sliceGraphemes } from "../utils/grapheme";

export function CuiterPage({
  user,
  users,
}: {
  user: AppUser;
  users: AppUser[];
}) {
  const { t } = useTranslation("cuiter");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [posts, setPosts] = useState<CuiterPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const usersById = useMemo(() => new Map(users.map((candidate) => [candidate.uid, candidate])), [users]);
  const charsCount = countGraphemes(message);
  const charsRemaining = CUITER_MAX_CHARS - charsCount;
  const availableCredits = getCuiterAvailableCredits(user);
  const unlocked = canPostOnCuiter(user);
  const canPublish = unlocked && !sending && charsCount > 0 && charsCount <= CUITER_MAX_CHARS;

  function isFirestorePermissionDenied(error: unknown): error is FirebaseError {
    return error instanceof FirebaseError && error.code === "permission-denied";
  }

  const orderedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      }),
    [posts],
  );

  async function loadInitial() {
    setLoadingFeed(true);
    try {
      const page = await fetchCuiterPostsPage(null);
      setPosts(page.posts);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      toast.error(t("loadFeedError"));
    } finally {
      setLoadingFeed(false);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, [user.uid]);

  async function handleLoadMore() {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchCuiterPostsPage(cursor);
      setPosts((current) => [...current, ...page.posts]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      toast.error(t("loadMoreError"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handlePublish() {
    if (!canPublish) return;
    setSending(true);
    try {
      const post = await createCuiterPost(user, message);
      setPosts((current) => [post, ...current]);

      setMessage("");
      toast.success(t("publishSuccess"));
    } catch (error) {
      if (isFirestorePermissionDenied(error)) {
        toast.error(t("permissionDenied"));
      } else {
        toast.error(error instanceof Error ? error.message : t("publishError"));
      }
    } finally {
      setSending(false);
    }
  }

  function resolvePostAuthor(post: CuiterPost) {
    const author = usersById.get(post.userId);
    return author?.nickname?.trim() || author?.name || post.userName;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-accent-strong">{t("eyebrow")}</p>
            <h2 className="text-2xl font-black text-fg">{t("title")}</h2>
          </div>
          <MessageCircle className="text-accent-strong" />
        </div>

        <div className="space-y-3">
          {!unlocked ? (
            <div className="rounded-2xl border border-accent/25 bg-accent-soft/30 p-3 text-sm text-accent-strong">
              {t("unlockInfo")}
            </div>
          ) : null}

          <textarea
            value={message}
            onChange={(event) => setMessage(sliceGraphemes(event.target.value, CUITER_MAX_CHARS))}
            placeholder={t("placeholder")}
            className="min-h-24 w-full resize-none rounded-2xl border border-line/15 bg-field p-3 text-sm text-fg outline-none ring-accent/20 transition placeholder:text-fg-muted focus:border-accent/35 focus:ring"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs font-bold ${charsRemaining < 20 ? "text-warning" : "text-fg-muted"}`}>
              {t("credits", { chars: charsRemaining, count: availableCredits })}
            </span>
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-black text-accent-fg transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={15} />
              {sending ? t("publishLoading") : t("publishAction")}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">{t("feedEyebrow")}</p>
          <h2 className="text-2xl font-black text-fg">{t("feedTitle")}</h2>
        </div>
        <div className="space-y-3">
          {loadingFeed ? (
            <div className="rounded-2xl border border-dashed border-line/15 p-8 text-center text-fg-muted">
              {t("feedLoading")}
            </div>
          ) : orderedPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line/15 p-8 text-center text-fg-muted">
              {t("feedEmpty")}
            </div>
          ) : (
            orderedPosts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-black text-fg">
                    {resolvePostAuthor(post)}
                  </p>
                  <p className="shrink-0 text-xs text-fg-muted">{formatTimeAgo(post.createdAt)}</p>
                </div>
                <p className="text-sm text-fg-soft">{post.message}</p>
              </article>
            ))
          )}
        </div>
        {hasMore && !loadingFeed ? (
          <div className="mt-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full rounded-2xl border border-line/10 bg-panel px-4 py-3 text-sm font-black text-fg transition hover:bg-panel-strong disabled:opacity-60"
            >
              {loadingMore ? t("loadMoreLoading") : t("loadMoreAction")}
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
