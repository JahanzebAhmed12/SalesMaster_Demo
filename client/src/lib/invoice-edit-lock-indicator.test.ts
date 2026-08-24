import assert from "node:assert/strict";
import {
  getInvoiceEditLockIndicator,
  type InvoiceEditLockOwner,
} from "./invoice-edit-lock-indicator";

const firstEditor: InvoiceEditLockOwner = {
  locked: true,
  userId: 101,
  username: "alice",
  acquiredAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z",
};

// Session A owns the lock and receives the active-editor indicator.
const ownerSession = getInvoiceEditLockIndicator({
  isReadOnly: false,
  ownsLock: true,
  lockOwner: firstEditor,
  canEditInvoice: true,
});
assert.equal(ownerSession?.kind, "active");
assert.equal(ownerSession?.title, "Editing locked to you.");
assert.match(ownerSession?.description ?? "", /Other users can view this invoice/);

// Session B sees the same server-provided owner, rather than its own identity.
const secondSession = getInvoiceEditLockIndicator({
  isReadOnly: true,
  ownsLock: false,
  lockOwner: firstEditor,
  canEditInvoice: true,
});
assert.equal(secondSession?.kind, "readonly");
assert.match(secondSession?.description ?? "", /Currently being edited by alice\./);
assert.match(secondSession?.protectionNote ?? "", /remains protected/);

// A different lock owner is rendered correctly after the first edit completes.
const secondEditor: InvoiceEditLockOwner = {
  ...firstEditor,
  userId: 202,
  username: "bob",
};
const thirdSession = getInvoiceEditLockIndicator({
  isReadOnly: true,
  ownsLock: false,
  lockOwner: secondEditor,
  canEditInvoice: true,
});
assert.match(thirdSession?.description ?? "", /Currently being edited by bob\./);
assert.doesNotMatch(thirdSession?.description ?? "", /alice/);

// A read-only session without owner metadata still receives safe generic text.
const genericReadonly = getInvoiceEditLockIndicator({
  isReadOnly: true,
  ownsLock: false,
  canEditInvoice: false,
});
assert.equal(genericReadonly?.kind, "readonly");
assert.match(genericReadonly?.description ?? "", /Only users with invoice-edit permission can edit it/);

console.log("Invoice edit-lock indicator cross-session regression: OK");
