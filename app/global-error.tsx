"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/observability/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            kind: "error",
            name: error.name || "Error",
            message: (error.message || "خطای ناشناخته").slice(0, 2_000),
            stack: error.stack?.slice(0, 12_000),
            source: "error-boundary.global",
            route: window.location.pathname,
            occurredAt: new Date().toISOString(),
            metadata: { digest: error.digest ?? "unknown" },
          },
        ],
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          boxSizing: "border-box",
          color: "#2d3561",
          background: "#f7f7ff",
          fontFamily: "Tahoma, Arial, sans-serif",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 520,
            boxSizing: "border-box",
            padding: 32,
            border: "1px solid #d8ddff",
            borderRadius: 24,
            background: "#fff",
            textAlign: "center",
            boxShadow: "0 18px 60px rgba(159, 161, 255, 0.16)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto",
              display: "grid",
              placeItems: "center",
              borderRadius: 16,
              color: "#be123c",
              background: "#fff1f2",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "20px 0 0", fontSize: 22 }}>
            برنامه با مشکل روبه‌رو شد
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              color: "#7080a3",
              fontSize: 14,
              lineHeight: 2,
            }}
          >
            ارتباط با برنامه قطع شد یا خطایی پیش آمد. اطلاعات شما حذف نشده
            است؛ دوباره تلاش کنید.
          </p>
          {error.digest ? (
            <p style={{ margin: "8px 0 0", color: "#98a2b3", fontSize: 12 }}>
              کد پیگیری: <span dir="ltr">{error.digest}</span>
            </p>
          ) : null}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "11px 20px",
                color: "#fff",
                background: "#6f78f7",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              تلاش دوباره
            </button>
            <Link
              href="/"
              style={{
                border: "1px solid #d8ddff",
                borderRadius: 12,
                padding: "10px 20px",
                color: "#3d4b73",
                background: "#fff",
                textDecoration: "none",
              }}
            >
              صفحهٔ اصلی
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
