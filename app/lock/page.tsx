"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type PublicUser = { id: string; name: string; color: string };
type Mode =
  | { kind: "loading" }
  | { kind: "picker"; users: PublicUser[] }
  | { kind: "first" } // empty registry → create first user
  | { kind: "login"; user: PublicUser }
  | { kind: "create"; users: PublicUser[] }
  | { kind: "delete"; user: PublicUser };

export default function LockPage() {
  const [next, setNext] = useState("/");
  const [mode, setMode] = useState<Mode>({ kind: "loading" });

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get("next");
      if (n) setNext(n);
    } catch {
      /* noop */
    }
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(redirectIfAuthed: boolean): Promise<void> {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = (await res.json()) as {
        users: PublicUser[];
        authedUserId: string | null;
      };
      if (redirectIfAuthed && data.authedUserId) {
        const params = new URLSearchParams(window.location.search);
        const target = params.get("next") || "/";
        window.location.href = target;
        return;
      }
      if (data.users.length === 0) {
        setMode({ kind: "first" });
      } else {
        setMode({ kind: "picker", users: data.users });
      }
    } catch {
      setMode({ kind: "first" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-7 shadow-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_60%)]" />
        <div className="relative">
          <AnimatePresence mode="wait">
            {mode.kind === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-6 text-sm text-muted"
              >
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading users…
              </motion.div>
            )}

            {mode.kind === "first" && (
              <CreateForm
                key="first"
                title="Create your first user"
                hint="Each user has their own portfolio and PIN."
                onDone={(target) => {
                  window.location.href = target ?? next;
                }}
              />
            )}

            {mode.kind === "picker" && (
              <Picker
                key="picker"
                users={mode.users}
                onPick={(user) => setMode({ kind: "login", user })}
                onAdd={() => setMode({ kind: "create", users: mode.users })}
                onDelete={(user) => setMode({ kind: "delete", user })}
              />
            )}

            {mode.kind === "login" && (
              <LoginForm
                key={`login-${mode.user.id}`}
                user={mode.user}
                next={next}
                onBack={() => void refresh(false)}
              />
            )}

            {mode.kind === "create" && (
              <CreateForm
                key="create"
                title="Add new user"
                hint="Choose a display name and a 4–8 digit PIN."
                onBack={() => void refresh(false)}
                onDone={(target) => {
                  window.location.href = target ?? next;
                }}
              />
            )}

            {mode.kind === "delete" && (
              <DeleteForm
                key={`del-${mode.user.id}`}
                user={mode.user}
                onBack={() => void refresh(false)}
                onDeleted={() => void refresh(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function Avatar({
  user,
  size = 40,
}: {
  user: PublicUser;
  size?: number;
}) {
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-md"
      style={{
        background: user.color,
        width: size,
        height: size,
        fontSize: size * 0.4,
        boxShadow: `0 6px 16px -8px ${user.color}`,
      }}
    >
      {initials || "?"}
    </span>
  );
}

function Picker({
  users,
  onPick,
  onAdd,
  onDelete,
}: {
  users: PublicUser[];
  onPick: (u: PublicUser) => void;
  onAdd: () => void;
  onDelete: (u: PublicUser) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/30">
        <Lock className="h-6 w-6 text-white" />
      </div>
      <h1 className="text-center text-lg font-semibold tracking-tight">
        Who&apos;s using this?
      </h1>
      <p className="mt-1 text-center text-xs text-muted">
        Pick a user to enter your PIN.
      </p>
      <div className="mt-5 space-y-2">
        {users.map((u) => (
          <div
            key={u.id}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            <button
              type="button"
              onClick={() => onPick(u)}
              className="flex flex-1 items-center gap-3 text-left"
            >
              <Avatar user={u} />
              <span className="text-sm font-medium">{u.name}</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(u)}
              className="rounded-md p-1.5 text-muted opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
              title={`Delete ${u.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-sm font-medium text-muted transition hover:border-white/30 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add new user
        </button>
      </div>
    </motion.div>
  );
}

function LoginForm({
  user,
  next,
  onBack,
}: {
  user: PublicUser;
  next: string;
  onBack: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must be 4–8 digits.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to authenticate.");
        setBusy(false);
        return;
      }
      window.location.href = next;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <div className="flex flex-col items-center gap-2">
        <Avatar user={user} size={56} />
        <div className="text-center text-sm font-semibold">{user.name}</div>
        <div className="text-center text-xs text-muted">Enter your PIN</div>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="one-time-code"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••"
          className="input text-center tracking-[0.5em]"
          disabled={busy}
        />
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Unlock
        </button>
      </form>
    </motion.div>
  );
}

function CreateForm({
  title,
  hint,
  onBack,
  onDone,
}: {
  title: string;
  hint: string;
  onBack?: () => void;
  onDone: (next?: string) => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must be 4–8 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to create user.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/30">
        <ShieldCheck className="h-6 w-6 text-white" />
      </div>
      <h1 className="text-center text-lg font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-1 text-center text-xs text-muted">{hint}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="input"
          disabled={busy}
          maxLength={40}
          autoFocus
        />
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN (4–8 digits)"
          className="input text-center tracking-[0.5em]"
          disabled={busy}
        />
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Confirm PIN"
          className="input text-center tracking-[0.5em]"
          disabled={busy}
        />
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim() || pin.length < 4}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Create user
        </button>
      </form>
    </motion.div>
  );
}

function DeleteForm({
  user,
  onBack,
  onDeleted,
}: {
  user: PublicUser;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to delete user.");
        setBusy(false);
        return;
      }
      onDeleted();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Cancel
      </button>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300 shadow-lg">
          <Trash2 className="h-6 w-6" />
        </div>
        <div className="text-center text-sm font-semibold">
          Delete {user.name}?
        </div>
        <div className="text-center text-xs text-muted">
          This removes their PIN and all their portfolio data. Enter their
          PIN to confirm.
        </div>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder={`${user.name}'s PIN`}
          className="input text-center tracking-[0.5em]"
          disabled={busy}
          autoFocus
        />
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-500 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Delete user
        </button>
      </form>
    </motion.div>
  );
}
