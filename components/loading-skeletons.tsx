function Line({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-[#e8ebff] ${className}`} />;
}

export function ProtectedPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری صفحه"
      className="h-full animate-pulse bg-white px-6 py-8 md:px-12"
      dir="rtl"
    >
      <div className="mx-auto max-w-[1100px]">
        <Line className="h-8 w-52" />
        <Line className="mt-5 h-4 w-80 max-w-full" />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="h-36 rounded-2xl bg-[#f1f3ff]" />
          <div className="h-36 rounded-2xl bg-[#f1f3ff]" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}

export function EditorPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری ویرایشگر"
      className="h-full animate-pulse bg-white"
      dir="rtl"
    >
      <div className="mx-auto min-h-[calc(100vh-136px)] max-w-[1400px] border-y border-[#e5e7ff] px-6 py-8 md:px-12 md:py-10">
        <Line className="h-9 w-2/5 min-w-48" />
        <div className="mt-10 space-y-4">
          <Line className="h-4 w-11/12" />
          <Line className="h-4 w-4/5" />
          <Line className="h-4 w-10/12" />
          <Line className="h-4 w-3/5" />
        </div>
        <div className="mt-12 h-28 rounded-2xl bg-[#f7f8ff]" />
      </div>
      <span className="sr-only">در حال بارگذاری ویرایشگر…</span>
    </div>
  );
}

export function NotebookPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری دفتر"
      className="h-full animate-pulse bg-white"
      dir="rtl"
    >
      <div className="mx-auto min-h-[calc(100vh-136px)] max-w-[1400px] border-y border-[#e5e7ff] px-6 py-10 md:px-12">
        <Line className="h-8 w-64 max-w-full" />
        <Line className="mt-5 h-4 w-96 max-w-full" />
        <Line className="mt-3 h-4 w-72 max-w-full" />
      </div>
      <span className="sr-only">در حال بارگذاری دفتر…</span>
    </div>
  );
}
