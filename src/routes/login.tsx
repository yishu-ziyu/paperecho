import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { authEnabled, signIn } from "@/lib/auth/client";
import { GROK_PROVIDERS } from "@/lib/auth/providers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LetterPop } from "@/game/components/LetterPop";

/**
 * /login —— 认证系统声明的入口页（gates.tsx: SIGN_IN_PATH）。
 * 纸上的回声同款视觉：纸卡 + letterpress 标题。
 * 开启认证时走 Google / X；未开启时提供「以游客身份进入」。
 */
export const Route = createFileRoute("/login")({ component: LoginPage });

const STARS = [
  { left: "12%", top: "18%", size: 3, delay: 0 },
  { left: "82%", top: "14%", size: 2, delay: 0.8 },
  { left: "24%", top: "78%", size: 2, delay: 1.4 },
  { left: "74%", top: "70%", size: 3, delay: 0.4 },
  { left: "55%", top: "10%", size: 2, delay: 2 },
  { left: "88%", top: "46%", size: 2, delay: 1 },
];

function NightShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-navy px-5">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      {children}
    </main>
  );
}

function LoadingNight() {
  return (
    <NightShell>
      <p className="text-sm tracking-[0.2em] text-paper/55">正在准备…</p>
    </NightShell>
  );
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (authEnabled) {
    if (isPending) return <LoadingNight />;
    if (user) return <Navigate to="/" />;
  }

  async function go(providerId: string) {
    if (busy) return;
    setBusy(providerId);
    setError(null);
    try {
      await signIn(providerId, { callbackURL: "/", errorCallbackURL: "/login" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录没有完成，再试一次。");
      setBusy(null);
    }
  }

  return (
    <NightShell>
      <section className="clay-sm w-full max-w-sm rounded-2xl px-6 py-9 text-center ring-1 ring-ink/10">
        <h1
          className="font-latin text-[2.6rem] font-bold leading-[0.9] tracking-wide text-ink"
          style={{ textShadow: "0 2px 0 #d9ccb4, 0 5px 0 #cbbda3, 0 12px 18px rgba(26,39,68,0.2)" }}
        >
          <span className="block">
            <LetterPop text="PAPER" />
          </span>
          <span className="block">
            <LetterPop text="ECHO" start={5} />
          </span>
        </h1>
        <p className="clip-up-mask mt-4 font-display text-base tracking-[0.28em] text-ink/70">
          <span className="clip-up">纸上的回声</span>
        </p>
        <p className="mt-5 font-hand text-lg leading-relaxed text-ink/65">
          未能说出口的，也能够被回应。
        </p>

        <div className="mx-auto mt-7 h-px w-24 bg-ink/15" />

        {authEnabled ? (
          <div className="mt-6 flex flex-col gap-3">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                disabled={busy !== null}
                onClick={() => go(p.providerId)}
                className="rounded-full border border-ink/15 bg-paper/85 px-5 py-2.5 text-sm font-semibold tracking-[0.08em] text-ink transition-colors hover:bg-paper disabled:cursor-wait disabled:opacity-50"
              >
                {busy === p.providerId ? "正在登录…" : `用 ${p.label} 继续`}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="mt-6 rounded-full border border-ink/15 bg-paper/85 px-5 py-2.5 text-sm font-semibold tracking-[0.08em] text-ink transition-colors hover:bg-paper"
          >
            以游客身份进入
          </button>
        )}

        {error ? <p className="mt-4 text-xs text-coral">{error}</p> : null}
      </section>

      <p className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] text-xs tracking-[0.18em] text-paper/45">
        回应，来自世界上另一个角落。
      </p>
    </NightShell>
  );
}
