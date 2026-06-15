import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "@firebase/firestore";
import { db } from "./firebase";
import i18n from "../i18n";
import type { AppUser, CuiterPost } from "../types";
import { countGraphemes } from "../utils/grapheme";
import {
  appendPoopcoinTransaction,
  formatPoopcoins,
} from "./poopcoinService";
import {
  DEFAULT_CUITER_POST_COST,
  appSettingsDocRef,
  normalizePoopcoinRuleValue,
} from "./settingsService";

export const CUITER_MAX_CHARS = 80;
export const CUITER_PAGE_SIZE = 10;
export const CUITER_CREDIT_START_DATE = new Date(2026, 4, 27, 0, 0, 0, 0);
export const cuiterPostsRef = collection(db, "cuiter_posts");

type CuiterPageCursor = QueryDocumentSnapshot<DocumentData> | null;

function mapPost(docSnapshot: QueryDocumentSnapshot<DocumentData>) {
  return { id: docSnapshot.id, ...docSnapshot.data() } as CuiterPost;
}

export async function fetchCuiterPostsPage(cursor: CuiterPageCursor, pageSize = CUITER_PAGE_SIZE) {
  const baseQuery = query(cuiterPostsRef, orderBy("createdAt", "desc"), limit(pageSize));
  const paginatedQuery = cursor
    ? query(cuiterPostsRef, orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize))
    : baseQuery;
  const snapshot = await getDocs(paginatedQuery);
  const docs = snapshot.docs;
  return {
    posts: docs.map(mapPost),
    nextCursor: docs.length > 0 ? docs[docs.length - 1] : cursor,
    hasMore: docs.length === pageSize,
  };
}

export async function countUserCuiterPosts(uid: string) {
  const snapshot = await getCountFromServer(
    query(
      cuiterPostsRef,
      where("userId", "==", uid),
      where("createdAt", ">=", Timestamp.fromDate(CUITER_CREDIT_START_DATE)),
    ),
  );
  return snapshot.data().count;
}

export function isCuiterCreditEligibleLog(createdAtMs: number) {
  return createdAtMs >= CUITER_CREDIT_START_DATE.getTime();
}

export function getCuiterAvailableCredits(user: AppUser) {
  return Math.max(0, Math.trunc(Number(user.poopcoinBalance ?? 0)));
}

export function canPostOnCuiter(user: AppUser, cuiterPostCost = DEFAULT_CUITER_POST_COST) {
  return getCuiterAvailableCredits(user) >= cuiterPostCost;
}

export async function createCuiterPost(user: AppUser, message: string) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new Error(i18n.t("cuiter:service.emptyMessage"));
  }

  if (countGraphemes(normalizedMessage) > CUITER_MAX_CHARS) {
    throw new Error(i18n.t("cuiter:service.tooLong", { count: CUITER_MAX_CHARS }));
  }

  const createdAt = Timestamp.now();
  const postRef = doc(cuiterPostsRef);
  let poopcoinTransactionHash = "";

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", user.uid);
    const [userSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(appSettingsDocRef),
    ]);
    const currentUser = userSnapshot.data() as AppUser | undefined;
    const cuiterPostCost = normalizePoopcoinRuleValue(
      Number(settingsSnapshot.data()?.cuiterPostCost ?? DEFAULT_CUITER_POST_COST),
      DEFAULT_CUITER_POST_COST,
    );

    if (!currentUser || currentUser.isActive === false) {
      throw new Error(i18n.t("auth:deactivated_user"));
    }

    if (Number(currentUser.poopcoinBalance ?? 0) < cuiterPostCost) {
      throw new Error(
        i18n.t("cuiter:service.missingCredits", {
          cost: formatPoopcoins(cuiterPostCost),
        }),
      );
    }

    const poopcoinTransaction = await appendPoopcoinTransaction(transaction, {
      type: "cuiter_spend",
      entries: [{ userId: user.uid, delta: -cuiterPostCost }],
      amount: cuiterPostCost,
      createdBy: user.uid,
      createdByRole: currentUser.role,
      fromUserId: user.uid,
      linkedPostId: postRef.id,
      createdAt,
      supplyEffect: {
        burnedDelta: cuiterPostCost,
        circulatingDelta: -cuiterPostCost,
      },
    });
    poopcoinTransactionHash = poopcoinTransaction.hash;

    transaction.set(postRef, {
      userId: user.uid,
      userName: currentUser.nickname?.trim() || currentUser.name,
      message: normalizedMessage,
      createdAt,
      poopcoinTransactionHash,
    });
    transaction.update(userRef, { poopcoinBalance: increment(-cuiterPostCost) });
  });

  return {
    id: postRef.id,
    userId: user.uid,
    userName: user.nickname?.trim() || user.name,
    message: normalizedMessage,
    createdAt,
    poopcoinTransactionHash,
  } as CuiterPost;
}

export async function fetchUserCuiterPosts(userId: string, limitCount = 10) {
  const q = query(
    cuiterPostsRef,
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapPost);
}
