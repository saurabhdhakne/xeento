// Firestore rules tests. Run with `npm run test:rules` (starts the
// Firestore emulator; needs Java). Uses Node's built-in test runner.
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env;
const page = { title: "A's page", updatedAt: 1, deleted: false };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-xeento",
    firestore: { rules: readFileSync("firebase/firestore.rules", "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // Seed A's data with rules bypassed.
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "users/alice/pages/p1"), { ...page, syncedAt: serverTimestamp() }),
  );
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test("a user reads and writes their own data", async () => {
  const db = as("alice");
  await assertSucceeds(getDoc(doc(db, "users/alice/pages/p1")));
  await assertSucceeds(getDocs(collection(db, "users/alice/pages")));
  await assertSucceeds(setDoc(doc(db, "users/alice/pages/p2"), { ...page, syncedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, "users/alice/pages/p1"), { title: "Renamed", syncedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, "users/alice/meta/schema"), { version: 1, syncedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(db, "users/alice/pages/p2")));
});

test("writes must stamp syncedAt with the server time", async () => {
  const db = as("alice");
  await assertFails(setDoc(doc(db, "users/alice/pages/p3"), page));
  await assertFails(setDoc(doc(db, "users/alice/pages/p3"), { ...page, syncedAt: 12345 }));
  await assertFails(updateDoc(doc(db, "users/alice/pages/p1"), { title: "No stamp" }));
});

test("user B can't read user A's data", async () => {
  const db = as("bob");
  await assertFails(getDoc(doc(db, "users/alice/pages/p1")));
  await assertFails(getDocs(collection(db, "users/alice/pages")));
  await assertFails(getDoc(doc(db, "users/alice/meta/schema")));
});

test("user B can't write user A's data", async () => {
  const db = as("bob");
  await assertFails(setDoc(doc(db, "users/alice/pages/p9"), { ...page, syncedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/alice/pages/p1"), { title: "Hacked", syncedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, "users/alice/pages/p1")));
});

test("signed-out users can't read or write anyone's data", async () => {
  const db = anon();
  await assertFails(getDoc(doc(db, "users/alice/pages/p1")));
  await assertFails(setDoc(doc(db, "users/alice/pages/p9"), { ...page, syncedAt: serverTimestamp() }));
});

test("the rules probe is readable by anyone; other top-level paths are denied", async () => {
  await assertSucceeds(getDoc(doc(anon(), "xeento-rules/v1")));
  await assertFails(getDoc(doc(anon(), "xeento-rules/v0")));
  await assertFails(getDoc(doc(as("alice"), "other/thing")));
  await assertFails(setDoc(doc(as("alice"), "xeento-rules/v1"), { x: 1 }));
});
