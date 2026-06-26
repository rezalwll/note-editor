export default function TrashEmptyPage() {
  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-[1400px] items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-2xl rounded-[18px] border border-[#ffd7df] bg-[linear-gradient(180deg,#fff8fa_0%,#ffffff_100%)] px-8 py-16 text-center shadow-[0_18px_40px_rgba(244,114,142,0.12)]"
          dir="rtl"
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#ffe7ec] text-[28px] text-[#d9485f]">
            !
          </div>
          <h1 className="text-2xl font-medium text-[#1f2937]">
            سطل بازیافت خالی است
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#6b7280]">
            همه موارد حذف‌شده پاک شده‌اند و در حال حاضر چیزی در سطل بازیافت
            وجود ندارد.
          </p>
        </div>
      </div>
    </div>
  );
}
