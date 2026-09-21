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
          <h1>
            یک جای آرام{" "}
            <span>برای فکرهای شلوغ.</span>
          </h1>
          <p className={styles.heroLead}>
            نوتاوا فضای فارسی شما برای نوشتن آزاد و مرتب‌کردن ایده‌هاست.
          </p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryCta}>
              فضای خودم رو می‌سازم
              <ArrowLeft size={19} />
            </Link>
            <Link href="/login" className={styles.secondaryCta}>
              حساب دارم، میام تو
            </Link>
          </div>
          <div className={styles.heroProof} aria-label="ویژگی‌های اصلی">
            <span><CheckCircle2 size={16} /> چیدمان آزاد بلوکی</span>
            <span><CheckCircle2 size={16} /> ذخیره‌ی خودکار</span>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section className={styles.promiseStrip} aria-label="مزیت‌های نوتاوا">
        <div>
          <Move size={22} />
          <span><strong>هرجور راحتی بنویس</strong><small>بلوک‌ها رو جابه‌جا کن و اندازه‌شون رو خودت تنظیم کن</small></span>
        </div>
        <div>
          <Layers3 size={22} />
          <span><strong>همه‌چیز دم دستت باشه</strong><small>از مجموعه تا صفحه، ایده‌هات رو راحت پیدا کن</small></span>
        </div>
        <div>
          <Search size={22} />
          <span><strong>سریع پیداش کن</strong><small>هرچی می‌خوای، با یه جست‌وجو بهش برس</small></span>
        </div>
      </section>

      <section className={styles.featuresSection} id="features">
        <SectionHeading
          eyebrow="چیزهایی که کار رو راحت می‌کنن"
          title="نوشتن و مرتب‌کردن قرار نیست سخت باشه."
          description="نوتاوا ابزارهاش رو آماده کرده تا تو فقط روی فکرهات تمرکز کنی و فضای خودت رو همون‌طور که دوست داری بچینی."
        />

        <div className={styles.bentoGrid}>
          <article className={`${styles.featureCard} ${styles.editorFeature}`}>
            <div className={styles.featureCopy}>
              <span className={styles.featureIcon}><Move size={20} /></span>
              <h3>صفحه‌ات رو هرجور دوست داری بچین</h3>
              <p>
                متن، تصویر و فهرست کارها رو جداگانه بچین؛ جابه‌جاشون کن،
                اندازه‌شون بده و صفحه رو شبیه فکر خودت بساز.
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
                <strong>ایده‌ی اصلی رو همین‌جا نگه دار</strong>
                <span>قالب از پیش‌ساخته‌ای دست‌وپات رو نمی‌بنده.</span>
              </div>
              <div className={styles.canvasTodoCard}>
                <Check size={12} />
                <span>قدم بعدی رو مشخص کن</span>
              </div>
              <div className={styles.canvasImageCard}>
                <ImageIcon size={18} />
              </div>
            </div>
          </article>

          <article className={`${styles.featureCard} ${styles.structureFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.mintIcon}`}><FolderOpen size={20} /></span>
              <h3>هر چیزی جای خودش</h3>
              <p>پروژه‌های بزرگ و یادداشت‌های روزانه‌ات رو همون‌طور که دوست داری مرتب کن.</p>
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
              <h3>دنبالش می‌گردی؟ پیداش می‌کنی</h3>
              <p>توی عنوان، متن، برچسب‌ها و فایل‌ها بگرد و مستقیم برو سراغ همون صفحه.</p>
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

          <article className={`${styles.featureCard} ${styles.themeFeature}`}>
            <div className={styles.featureCopy}>
              <span className={`${styles.featureIcon} ${styles.roseIcon}`}><Palette size={20} /></span>
              <h3>هر مجموعه، حال‌وهوای خودش رو داره</h3>
              <p>با رنگ‌ها و تم‌های مختلف، مسیرهای فکری‌ات رو با یک نگاه از هم جدا کن.</p>
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
          <h2>راهش ساده‌ست؛ خودت جلو می‌ری.</h2>
          <p>
            از همون اول یک فضای آماده داری؛ بعدش هرطور راحتی جلو برو و کم‌کم
            فضای خودت رو بساز.
          </p>
          <Link href="/signup" className={styles.textLink}>
            شروع کنیم
            <ArrowLeft size={17} />
          </Link>
        </div>

        <div className={styles.steps}>
            <article>
            <span className={styles.stepNumber}>۱</span>
              <div><h3>مجموعه‌ات رو بساز</h3><p>کار، زندگی، مطالعه؛ هر چیزی که برات مهمه.</p></div>
          </article>
          <article>
            <span className={styles.stepNumber}>۲</span>
              <div><h3>راحت و بی‌وقفه بنویس</h3><p>متن، تصویر و فهرست کار رو هرجور خودت می‌پسندی کنار هم بچین.</p></div>
          </article>
          <article>
            <span className={styles.stepNumber}>۳</span>
              <div><h3>هرجا بودی ادامه بده</h3><p>روی صفحه‌ی کوچک یا بزرگ، نوتاوا با ریتم تو جلو میاد.</p></div>
          </article>
        </div>
      </section>

      <section className={styles.securitySection} id="security">
        <div className={styles.securityGlow} aria-hidden="true" />
        <div className={styles.securityCopy}>
          <h2>یادداشت‌های تو، مال خودت می‌مونن.</h2>
          <p>
            با قفل الگویی، کنترل تعارض‌ها و ابزارهای پشتیبان، خیالت از بابت
            یادداشت‌هات راحت‌تره.
          </p>
          <ul>
            <li><Check size={16} /> قفل جداگانه برای ورود سریع و امن</li>
            <li><Check size={16} /> دیدن هر دو نسخه وقتی تغییری با تغییر دیگر قاطی می‌شود</li>
            <li><Check size={16} /> گرفتن و برگرداندن نسخه‌ی پشتیبان فضای کاری</li>
          </ul>
        </div>

        <div className={styles.securityVisual} aria-label="نمای قفل الگویی نوتاوا">
          <div className={styles.lockCard}>
            <span className={styles.lockIcon}><LockKeyhole size={24} /></span>
            <strong>فضای خودت</strong>
             <small>برای ادامه، الگوت رو بکش</small>
            <div className={styles.patternGrid} aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} className={index === 0 || index === 1 || index === 4 || index === 7 ? styles.patternActive : undefined} />
              ))}
              <i className={styles.patternLineOne} />
              <i className={styles.patternLineTwo} />
              <i className={styles.patternLineThree} />
            </div>
             <span className={styles.lockStatus}><ShieldCheck size={14} /> فضای تو قفل شده</span>
          </div>
        </div>
      </section>

      <section className={styles.questionsSection} id="questions">
        <SectionHeading
          eyebrow="چند سؤال کوتاه"
          title="قبل از شروع شاید این‌ها به کارت بیاد."
          description="چند جواب ساده برای سؤال‌هایی که ممکنه موقع شروع داشته باشی."
        />
        <div className={styles.faqList}>
          <details>
            <summary>می‌تونم نوتاوا رو روی موبایل نصب کنم؟ <Plus size={19} /></summary>
            <p>بله، نوتاوا یک وب‌اپ نصب‌شدنیه و روی موبایل و دسکتاپ خوب کار می‌کنه.</p>
          </details>
          <details>
            <summary>می‌تونم از کارهام نسخه‌ی پشتیبان بگیرم؟ <Plus size={19} /></summary>
            <p>از تنظیمات، فضای کارت رو به‌صورت فایل بگیر و هر وقت خواستی دوباره برش گردون.</p>
          </details>
          <details>
            <summary>اگه هم‌زمان روی دو دستگاه تغییر بدم چی؟ <Plus size={19} /></summary>
            <p>اگر تغییرها با هم قاطی بشن، هر دو نسخه رو نشونت می‌دیم تا خودت تصمیم بگیری.</p>
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
          <span className={styles.eyebrow}>فکر بعدی همین نزدیکی‌هاست</span>
          <h2>براش یه جا درست کن.</h2>
          <p>فضای نوتاوا رو بساز و اولین صفحه‌ات رو همون‌طور که دوست داری راه بنداز.</p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryCta}>بزن بریم <ArrowLeft size={19} /></Link>
            <Link href="/login" className={styles.secondaryCta}>ورود به حساب</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand}>
          <Image src="/brand/notava-logo.png" alt="نوتاوا" width={116} height={37} />
        </Link>
        <p>یه فضای آروم برای نوشتن، مرتب‌کردن و ساختن ایده‌ها.</p>
        <div>
          <a href="#features">امکانات</a>
          <Link href="/login">ورود</Link>
          <Link href="/signup">ساخت حساب</Link>
        </div>
      </footer>
    </main>
  );
}
