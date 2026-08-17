import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  Bold,
  Check,
  CheckCircle2,
  CloudCheck,
  FileText,
  FolderOpen,
  GripVertical,
  Highlighter,
  ImageIcon,
  Italic,
  Layers3,
  ListTodo,
  LockKeyhole,
  Move,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "نوتاوا | یک جای آرام برای فکرهای شلوغ",
  description:
    "نوتاوا فضای شخصی فارسی برای یادداشت‌برداری آزاد، دسته‌بندی ایده‌ها و ادامه‌دادن روی موبایل و دسکتاپ است.",
  openGraph: {
    title: "نوتاوا | یک جای آرام برای فکرهای شلوغ",
    description:
      "آزاد بنویسید، ایده‌ها را به روش خودتان مرتب کنید و همه‌جا به آن‌ها دسترسی داشته باشید.",
    locale: "fa_IR",
    type: "website",
  },
};

function ProductPreview() {
  return (
    <div className={styles.previewStage} aria-label="پیش‌نمایش محیط نوتاوا">
      <div className={styles.previewGlow} aria-hidden="true" />
      <div className={styles.appWindow}>
        <div className={styles.windowTopbar}>
          <div className={styles.windowBrand}>
            <Image
              src="/brand/notava-icon-192.png"
              alt=""
              width={26}
              height={26}
              aria-hidden="true"
            />
            <span>notava</span>
          </div>
          <div className={styles.windowSearch}>
            <Search size={13} strokeWidth={2} />
            <span>جست‌وجو در یادداشت‌ها</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className={styles.avatar}>ن</div>
        </div>

        <div className={styles.collectionTabs}>
          <span className={styles.activeCollection}>زندگی من</span>
          <span>کار و پروژه‌ها</span>
          <span>یادگیری</span>
          <span className={styles.addTab}><Plus size={12} /> مجموعه</span>
        </div>

        <div className={styles.notebookTabs}>
          <span className={styles.activeNotebook}>برنامه‌های این هفته</span>
          <span>ایده‌های تازه</span>
          <span>کتاب‌هایی که می‌خوانم</span>
        </div>

        <div className={styles.workspaceMock}>
          <div className={styles.editorMock}>
            <div className={styles.editorToolbar}>
              <Bold size={13} />
              <Italic size={13} />
              <Highlighter size={13} />
              <ListTodo size={13} />
              <ImageIcon size={13} />
              <span className={styles.toolbarDivider} />
              <span>ذخیره شد</span>
              <CloudCheck size={13} />
            </div>
            <div className={styles.editorCanvas}>
              <div className={styles.mockTitleRow}>
                <span className={styles.mockTitle}>برای یک هفته‌ی سبک‌تر</span>
                <span className={styles.mockDate}>۲۶ مرداد ۱۴۰۵</span>
              </div>

              <div className={`${styles.noteBlock} ${styles.noteBlockPrimary}`}>
                <span className={styles.dragHandle}><GripVertical size={12} /></span>
                <strong>سه کاری که واقعاً مهم‌اند</strong>
                <p>روی چیزهای اصلی تمرکز کنم و باقی را برای بعد نگه دارم.</p>
              </div>

              <div className={`${styles.noteBlock} ${styles.noteBlockTodo}`}>
                <span className={styles.todoDone}><Check size={11} /></span>
                <span>مرور یادداشت‌های جلسه</span>
                <span className={styles.todoEmpty} />
                <span>طرح اولیه‌ی صفحه‌ی جدید</span>
              </div>

              <div className={`${styles.noteBlock} ${styles.noteBlockIdea}`}>
                <Sparkles size={15} />
                <span>ایده: هر روز فقط یک قدم کوچک</span>
              </div>
            </div>
          </div>

          <aside className={styles.pagesMock}>
            <div className={styles.pagesTitle}>
              <span>صفحه‌ها</span>
              <Plus size={13} />
            </div>
            <div className={styles.activePage}>
              <FileText size={13} />
              <span>برنامه‌ی هفتگی</span>
            </div>
            <div><FileText size={13} /><span>فهرست مطالعه</span></div>
            <div><FileText size={13} /><span>ایده‌های پراکنده</span></div>
            <div><FileText size={13} /><span>هدف‌های امسال</span></div>
          </aside>
        </div>
      </div>

      <div className={`${styles.floatingBadge} ${styles.syncBadge}`}>
        <span className={styles.statusIcon}><CloudCheck size={17} /></span>
        <span><strong>همه‌چیز ذخیره شد</strong><small>فکرت از دست نمی‌رود</small></span>
      </div>

      <div className={`${styles.floatingBadge} ${styles.organizeBadge}`}>
        <span className={styles.statusIconAlt}><Layers3 size={17} /></span>
        <span><strong>هر چیز سر جای خودش</strong><small>مجموعه، زیرمجموعه، صفحه</small></span>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.heroBackdrop} aria-hidden="true">
        <span className={styles.heroOrbOne} />
        <span className={styles.heroOrbTwo} />
        <span className={styles.heroGrid} />
      </div>

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="ناوبری اصلی">
          <Link href="/" className={styles.logoLink} aria-label="صفحه اصلی نوتاوا">
            <Image
              src="/brand/notava-logo.png"
              alt="نوتاوا"
              width={142}
              height={46}
              priority
            />
          </Link>

          <div className={styles.navLinks}>
            <a href="#features">امکانات</a>
            <a href="#experience">تجربه‌ی نوشتن</a>
            <a href="#security">امنیت و خیال راحت</a>
            <a href="#questions">پرسش‌ها</a>
          </div>

          <div className={styles.navActions}>
            <Link href="/login" className={styles.loginLink}>ورود</Link>
            <Link href="/signup" className={styles.navCta}>
              شروع در نوتاوا
              <ArrowLeft size={16} />
            </Link>
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>
            <Sparkles size={16} />
            <span>فضای شخصی برای فکرهای در حرکت</span>
          </div>
          <h1>
            یک جای آرام
            <span>برای فکرهای شلوغ.</span>
          </h1>
          <p className={styles.heroLead}>
            نوتاوا فضای فارسی شما برای نوشتن آزاد، مرتب‌کردن ایده‌ها و
            ادامه‌دادن از هر دستگاهی است؛ حتی وقتی اینترنت همراهتان نیست.
          </p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryCta}>
              فضای خودم را بسازم
              <ArrowLeft size={19} />
            </Link>
            <Link href="/login" className={styles.secondaryCta}>
              حساب دارم؛ ورود
            </Link>
          </div>
          <div className={styles.heroProof} aria-label="ویژگی‌های اصلی">
            <span><CheckCircle2 size={16} /> چیدمان آزاد بلوکی</span>
            <span><CheckCircle2 size={16} /> ذخیره‌ی خودکار</span>
            <span><CheckCircle2 size={16} /> آماده برای آفلاین</span>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section className={styles.promiseStrip} aria-label="مزیت‌های نوتاوا">
        <div>
          <Move size={22} />
          <span><strong>آزاد بنویس</strong><small>بلوک‌ها را جابه‌جا و اندازه‌شان را تنظیم کن</small></span>
        </div>
        <div>
          <Layers3 size={22} />
          <span><strong>به روش خودت مرتب کن</strong><small>از مجموعه تا صفحه، بدون گم‌شدن ایده‌ها</small></span>
        </div>
        <div>
          <CloudCheck size={22} />
          <span><strong>هرجا ادامه بده</strong><small>روی موبایل و دسکتاپ، آنلاین یا آفلاین</small></span>
        </div>
      </section>

      <section className={styles.featuresSection} id="features">
        <SectionHeading
          eyebrow="همه‌چیز برای یک ذهن منظم"
          title="نوشتن باید ساده باشد؛ نظم‌دادن هم همین‌طور."
          description="نوتاوا ابزارهای لازم را در اختیارتان می‌گذارد، اما اجازه می‌دهد فضای شخصی‌تان را درست همان‌طور که دوست دارید بسازید."
        />

        <div className={styles.bentoGrid}>
          <article className={`${styles.featureCard} ${styles.editorFeature}`}>
            <div className={styles.featureCopy}>
              <span className={styles.featureIcon}><Move size={20} /></span>
              <h3>روی یک صفحه‌ی واقعاً آزاد بنویس</h3>
              <p>
                متن، تصویر و فهرست کارها را در بلوک‌های مستقل بساز؛ جابه‌جا کن،
                اندازه بده و صفحه را شبیه ذهن خودت بچین.
              </p>
            </div>
            <div className={styles.freeCanvas} aria-hidden="true">
              <div className={styles.canvasToolbar}>
                <Bold size={14} />
                <Italic size={14} />
                <Highlighter size={14} />
                <ListTodo size={14} />
                <ImageIcon size={14} />
              </div>
              <div className={styles.canvasLine} />
              <div className={styles.canvasTextCard}>
                <span className={styles.canvasHandle}><GripVertical size={13} /></span>
                <strong>ایده‌ی اصلی را همین‌جا نگه دار</strong>
                <span>بدون محدودشدن به یک قالب از پیش‌ساخته.</span>
              </div>
              <div className={styles.canvasTodoCard}>
                <Check size={12} />
                <span>قدم بعدی را مشخص کن</span>
              </div>
              <div className={styles.canvasImageCard}>
                <ImageIcon size={18} />
              </div>
            </div>
          </article>

          <article className={`${styles.featureCard} ${styles.structureFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.mintIcon}`}><FolderOpen size={20} /></span>
              <h3>هر فکر، جای خودش</h3>
              <p>از پروژه‌های بزرگ تا یک یادداشت روزانه، ساختار را به روش خودتان بسازید.</p>
            </div>
            <div className={styles.structureTree} aria-hidden="true">
              <div className={styles.treeCollection}><Layers3 size={16} /><span>مجموعه‌ی شخصی</span></div>
              <div className={styles.treeBranch}>
                <div><FolderOpen size={15} /><span>یادگیری</span><small>۱۲ صفحه</small></div>
                <div className={styles.treeActive}><FolderOpen size={15} /><span>ایده‌ها</span><small>۸ صفحه</small></div>
                <div><FolderOpen size={15} /><span>برنامه‌ها</span><small>۵ صفحه</small></div>
              </div>
            </div>
          </article>

          <article className={`${styles.featureCard} ${styles.searchFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.skyIcon}`}><Search size={20} /></span>
              <h3>پیدایش کن؛ سریع و دقیق</h3>
              <p>میان عنوان، متن، برچسب‌ها و فایل‌ها جست‌وجو کن و مستقیم به همان صفحه برس.</p>
            </div>
            <div className={styles.searchDemo} aria-hidden="true">
              <div className={styles.searchInput}><Search size={16} /><span>طرح محصول</span><kbd>⌘ K</kbd></div>
              <div className={styles.searchResult}>
                <span className={styles.resultIcon}><FileText size={15} /></span>
                <span><strong>ایده‌های طرح محصول</strong><small>کار و پروژه‌ها · امروز</small></span>
                <ArrowUpLeft size={15} />
              </div>
              <div className={`${styles.searchResult} ${styles.searchResultMuted}`}>
                <span className={styles.resultIcon}><FileText size={15} /></span>
                <span><strong>جلسه‌ی معرفی محصول</strong><small>یادداشت جلسات · هفته‌ی قبل</small></span>
              </div>
            </div>
          </article>

          <article className={`${styles.featureCard} ${styles.offlineFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.amberIcon}`}><WifiOff size={20} /></span>
              <h3>اینترنت رفت؟ فکرهایت نه.</h3>
              <p>یادداشت‌ها را آفلاین ادامه بده؛ نوتاوا پس از اتصال دوباره تغییرات را همگام می‌کند.</p>
            </div>
            <div className={styles.offlineVisual} aria-hidden="true">
              <div className={styles.phoneFrame}>
                <span className={styles.phoneNotch} />
                <div className={styles.phoneHeader}><Image src="/brand/notava-icon-192.png" alt="" width={20} height={20} /><span>یادداشت امروز</span></div>
                <div className={styles.phoneText}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.phoneOffline}><WifiOff size={12} /> آفلاین؛ ذخیره روی دستگاه</div>
              </div>
              <div className={styles.syncTrail}><span /><span /><span /></div>
              <div className={styles.cloudBubble}><CloudCheck size={23} /><small>همگام شد</small></div>
            </div>
          </article>

          <article className={`${styles.featureCard} ${styles.themeFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.roseIcon}`}><Palette size={20} /></span>
              <h3>هر مجموعه، حال‌وهوای خودش</h3>
              <p>با رنگ‌ها و تم‌های مختلف، مسیرهای فکری‌تان را یک نگاه از هم تشخیص دهید.</p>
            </div>
            <div className={styles.themeStack} aria-hidden="true">
              <span className={styles.themeLavender}>پروژه‌ی شخصی</span>
              <span className={styles.themeMint}>مطالعه و یادگیری</span>
              <span className={styles.themePeach}>ایده‌های تازه</span>
              <span className={styles.themeSky}>برنامه‌ی روزانه</span>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.experienceSection} id="experience">
        <div className={styles.experienceIntro}>
          <span className={styles.eyebrow}>از فکر تا یک صفحه‌ی مرتب</span>
          <h2>مسیر ساده‌ای که مزاحم فکرکردن نمی‌شود.</h2>
          <p>
            نوتاوا از همان لحظه‌ی شروع، یک فضای آماده به شما می‌دهد؛ باقی مسیر را
            خودتان و با ریتم خودتان شکل می‌دهید.
          </p>
          <Link href="/signup" className={styles.textLink}>
            شروع ساختن فضای من
            <ArrowLeft size={17} />
          </Link>
        </div>

        <div className={styles.steps}>
          <article>
            <span className={styles.stepNumber}>۱</span>
            <div><h3>مجموعه‌ات را بساز</h3><p>کار، زندگی، مطالعه یا هر مسیری که برایت معنا دارد.</p></div>
          </article>
          <article>
            <span className={styles.stepNumber}>۲</span>
            <div><h3>آزاد و بی‌وقفه بنویس</h3><p>با متن، تصویر، فهرست کار و چیدمانی که خودت انتخاب می‌کنی.</p></div>
          </article>
          <article>
            <span className={styles.stepNumber}>۳</span>
            <div><h3>هرجا بودی ادامه بده</h3><p>نوتاوا روی نمایشگر کوچک و بزرگ همراه جریان فکرت می‌ماند.</p></div>
          </article>
        </div>
      </section>

      <section className={styles.securitySection} id="security">
        <div className={styles.securityGlow} aria-hidden="true" />
        <div className={styles.securityCopy}>
          <span className={styles.darkEyebrow}><ShieldCheck size={16} /> امنیت، بدون پیچیدگی</span>
          <h2>یادداشت شخصی باید واقعاً شخصی بماند.</h2>
          <p>
            قفل الگویی، پاک‌شدن داده‌های محلی هنگام خروج و مدیریت روشن تعارض‌ها
            کمک می‌کنند کنترل فضای فکری‌تان دست خودتان بماند.
          </p>
          <ul>
            <li><Check size={16} /> قفل جداگانه برای ورود سریع و امن به برنامه</li>
            <li><Check size={16} /> نگه‌داشتن نسخه‌ی هر دو طرف هنگام تعارض همگام‌سازی</li>
            <li><Check size={16} /> دریافت و بازیابی نسخه‌ی پشتیبان فضای کاری</li>
          </ul>
        </div>

        <div className={styles.securityVisual} aria-label="نمای قفل الگویی نوتاوا">
          <div className={styles.lockCard}>
            <span className={styles.lockIcon}><LockKeyhole size={24} /></span>
            <strong>فضای شخصی شما</strong>
            <small>برای ادامه الگوی خود را بکشید</small>
            <div className={styles.patternGrid} aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} className={index === 0 || index === 1 || index === 4 || index === 7 ? styles.patternActive : undefined} />
              ))}
              <i className={styles.patternLineOne} />
              <i className={styles.patternLineTwo} />
              <i className={styles.patternLineThree} />
            </div>
            <span className={styles.lockStatus}><ShieldCheck size={14} /> محافظت‌شده با قفل برنامه</span>
          </div>
        </div>
      </section>

      <section className={styles.questionsSection} id="questions">
        <SectionHeading
          eyebrow="پرسش‌های کوتاه"
          title="چیزهایی که شاید بخواهید بدانید."
          description="پاسخ‌های روشن درباره‌ی استفاده‌ی روزمره از نوتاوا."
        />
        <div className={styles.faqList}>
          <details>
            <summary>نوتاوا بدون اینترنت هم کار می‌کند؟ <Plus size={19} /></summary>
            <p>بله. بعد از بارگذاری اولیه می‌توانید یادداشت‌های در دسترس را آفلاین ویرایش کنید؛ تغییرات پس از اتصال دوباره همگام می‌شوند.</p>
          </details>
          <details>
            <summary>می‌توانم نوتاوا را روی موبایل نصب کنم؟ <Plus size={19} /></summary>
            <p>بله. نوتاوا یک وب‌اپ نصب‌پذیر است و رابط آن برای موبایل و دسکتاپ طراحی شده است.</p>
          </details>
          <details>
            <summary>راهی برای نگه‌داشتن نسخه‌ی پشتیبان دارم؟ <Plus size={19} /></summary>
            <p>از بخش تنظیمات می‌توانید فضای کاری‌تان را به‌صورت فایل خروجی بگیرید و در صورت نیاز دوباره وارد کنید.</p>
          </details>
          <details>
            <summary>اگر هم‌زمان روی دو دستگاه ویرایش کنم چه می‌شود؟ <Plus size={19} /></summary>
            <p>اگر تغییرها با هم تعارض داشته باشند، نوتاوا آن را مشخص می‌کند تا نسخه‌ی درست را خودتان انتخاب کنید.</p>
          </details>
        </div>
      </section>

      <section className={styles.finalCtaSection}>
        <div className={styles.finalCtaArt} aria-hidden="true">
          <span className={styles.finalSheetOne} />
          <span className={styles.finalSheetTwo} />
          <Image src="/brand/notava-icon-512.png" alt="" width={132} height={132} />
        </div>
        <div className={styles.finalCtaCopy}>
          <span className={styles.eyebrow}>فکر بعدی از راه می‌رسد</span>
          <h2>از همین حالا جایی برایش بساز.</h2>
          <p>فضای شخصی نوتاوا را بسازید و اولین صفحه‌تان را همان‌طور که دوست دارید شکل دهید.</p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryCta}>شروع در نوتاوا <ArrowLeft size={19} /></Link>
            <Link href="/login" className={styles.secondaryCta}>ورود به حساب</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand}>
          <Image src="/brand/notava-logo.png" alt="نوتاوا" width={116} height={37} />
        </Link>
        <p>فضای آرام شما برای نوشتن، نظم‌دادن و ساختن ایده‌ها.</p>
        <div>
          <a href="#features">امکانات</a>
          <Link href="/login">ورود</Link>
          <Link href="/signup">ساخت حساب</Link>
        </div>
      </footer>
    </main>
  );
}
