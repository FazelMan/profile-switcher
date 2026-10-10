import type { ErrorCode } from '@shared/domain/errors';
import type { MessageCode } from '@shared/domain/messages';
import type { Catalog, ErrorText } from './en';

/**
 * Persian (فارسی) catalog. It has exactly the shape of the English catalog;
 * the type checker rejects a missing or extra key.
 *
 * Code, options, paths, and product names stay in Latin script. Inline
 * left-to-right tokens are wrapped with `ltr()` (Unicode isolates) so they
 * keep their reading order inside right-to-left sentences. Interpolated
 * values are isolated automatically by the i18n layer.
 */
const ltr = (text: string) => `⁦${text}⁩`;

const messages: Record<MessageCode, string> = {
  'compat.claudeCode.isolated.summary': `پوشهٔ پیکربندی جداگانه با ${ltr('CLAUDE_CONFIG_DIR')} که Anthropic آن را مستند کرده است. Claude Code نسخهٔ {version} شناسایی شد.`,
  'compat.claudeCode.isolated.guarantee.configDir':
    'Claude Code تنظیمات، سرورهای MCP و وضعیت هر پروژه را در پوشهٔ خود همین پروفایل می‌خواند و می‌نویسد.',
  'compat.claudeCode.isolated.guarantee.credentials': `ورودی که در این پروفایل با claude.ai (یا کلید API کنسول) انجام شود فقط برای همین پوشه ذخیره می‌شود؛ در فایل ${ltr('.credentials.json')} یا در macOS در یک مورد Keychain که به همین پوشه وابسته است.`,
  'compat.claudeCode.isolated.guarantee.history':
    'تاریخچهٔ جلسه‌ها، متن گفتگوها و افزونه‌ها در پوشهٔ همین پروفایل نگه داشته می‌شوند.',
  'compat.claudeCode.isolated.guarantee.concurrent':
    'پروفایل‌ها می‌توانند همزمان اجرا شوند و هر فرایند Claude Code فقط از پوشهٔ خودش استفاده می‌کند. اجرای یک پروفایل هیچ‌وقت پروفایل دیگری را تغییر نمی‌دهد؛ فقط در حالت جابه‌جایی و پس از تأیید شما بسته می‌شود.',
  'compat.claudeCode.limitation.consoleKeyless':
    'ورودهای کنسول بدون کلید API («پروفایل‌های Anthropic») بیرون از پوشهٔ پیکربندی ذخیره می‌شوند و بین پروفایل‌ها مشترک‌اند.',
  'compat.claudeCode.limitation.projectFiles': `فایل‌های پروژه مانند ${ltr('.claude/settings.json')} و ${ltr('CLAUDE.md')} در مخزن‌های شما هستند و برای هر پروفایلی که آن‌ها را باز کند اعمال می‌شوند.`,
  'compat.claudeCode.limitation.managedSettings':
    'تنظیمات و سیاست‌هایی که سازمان روی این رایانه اعمال کرده است، برای همهٔ پروفایل‌ها اعمال می‌شوند.',
  'compat.claudeCode.limitation.entitlements':
    'اشتراک، محدودیت‌های طرح و عضویت در سازمان از حسابی می‌آید که با آن وارد می‌شوید، نه از پروفایل.',
  'compat.claudeCode.limitation.credentialEnvInherited':
    'این پروفایل متغیرهای اعتبارنامه را به Claude Code می‌دهد. این متغیرها بر ورود خود پروفایل اولویت دارند.',
  'compat.claudeCode.limitation.providerEnv':
    'یک متغیر ارائه‌دهندهٔ ابری یا فدراسیون فعال است، بنابراین Claude Code به‌جای ورود این پروفایل از طریق آن ارائه‌دهنده احراز هویت می‌کند.',
  'compat.claudeCode.shared.summary': 'از پیکربندی پیش‌فرض Claude Code استفاده می‌کند. مجزا نیست.',
  'compat.claudeCode.shared.limitation': `تنظیمات، تاریخچه و ورود با هر استفادهٔ دیگری از Claude Code که ${ltr('CLAUDE_CONFIG_DIR')} را تنظیم نمی‌کند مشترک است.`,
  'compat.claudeCode.versionUnknown.summary':
    'Claude Code پیدا شد، اما نسخهٔ آن خوانده نشد. پیش از تکیه بر جداسازی، این پروفایل را بررسی کنید.',
  'compat.claudeCode.needsVerification.credentialEnv':
    'متغیرهای اعتبارنامه ({variables}) عبور داده می‌شوند و بر ورود این پروفایل اولویت دارند.',
  'compat.claudeCode.needsVerification.providerEnv':
    'متغیرهای ارائه‌دهنده ({variables}) فعال‌اند، بنابراین ممکن است ورود جداگانهٔ هر پروفایل اعمال نشود.',
  'compat.claudeCode.guidance.signIn': `پروفایل را اجرا کنید و با ${ltr('/login')} وارد شوید. هر پروفایل جداگانه وارد می‌شود.`,
  'compat.claudeCode.guidance.verify':
    'با «بررسی» از Claude Code بپرسید واقعاً از کدام پوشهٔ پیکربندی و کدام حساب استفاده می‌کند.',
  'compat.claudeCode.guidance.install': 'Claude Code را نصب کنید و سپس شناسایی را تازه کنید.',
  'compat.claudeCode.guidance.unsetProviderEnv':
    'اگر ورود جداگانه برای هر پروفایل می‌خواهید، متغیرهای ارائه‌دهنده را از محیط خود حذف کنید.',
  'compat.claudeDesktop.summary':
    'Claude Desktop را با داده‌ها و ورود معمول خودش باز می‌کند. مجزا نیست.',
  'compat.claudeDesktop.limitation.noIsolation':
    'Anthropic روشی برای اجرای Claude Desktop با پوشه‌های دادهٔ جداگانه مستند نکرده است. این پروفایل از داده‌های معمول Claude Desktop استفاده می‌کند که با هر اجرای عادی مشترک است.',
  'compat.claudeDesktop.limitation.singleInstance':
    'اگر Claude Desktop در حال اجرا باشد، باز کردن آن فقط پنجرهٔ موجود را جلو می‌آورد و حساب را عوض نمی‌کند.',
  'compat.claudeDesktop.limitation.noConcurrent':
    'Claude Desktop با داده‌های معمول خودش در هر لحظه فقط یک حساب را اجرا می‌کند.',
  'compat.claudeDesktop.guarantee.opensApp': 'برنامهٔ Claude Desktop نصب‌شده را باز می‌کند.',
  'compat.claudeDesktop.guidance.switchInApp':
    'برای استفاده از حساب دیگر، داخل Claude Desktop از حساب خارج شوید و دوباره وارد شوید.',
  'compat.claudeDesktop.guidance.install': `Claude Desktop را از ${ltr('claude.ai/download')} نصب کنید و سپس شناسایی را تازه کنید.`,
  'compat.claudeDesktop.unsupportedPlatform.summary':
    'Claude Desktop برای این سیستم‌عامل در دسترس نیست.',
  'compat.claudeDesktop.guidance.enableExperimental':
    'برای اجرای چند حساب در کنار هم، پروفایل‌های آزمایشی Claude Desktop را در تنظیمات روشن کنید و سپس یک پروفایل Claude Desktop با پوشهٔ مخصوص خودش بسازید.',
  'compat.claudeDesktop.experimental.summary': `آزمایشی. Claude Desktop با پوشهٔ دادهٔ مخصوص همین پروفایل و از طریق گزینهٔ مستندنشدهٔ ${ltr('--user-data-dir')} اجرا می‌شود. نه Anthropic و نه Profile Switcher تضمین نمی‌کنند که حساب‌ها جدا بمانند؛ پیش از تکیه بر آن خودتان بررسی کنید.`,
  'compat.claudeDesktop.experimental.checkedSummary':
    'آزمایشی · بررسی‌شده توسط شما. شما ثبت کرده‌اید که این پروفایل با نسخهٔ نصب‌شدهٔ Claude Desktop ورود خودش را نگه می‌دارد. این مشاهدهٔ خود شماست، نه یک تضمین.',
  'compat.claudeDesktop.experimental.versionChanged':
    'Claude Desktop پس از بررسی شما تغییر کرده است. ممکن است گزینهٔ مستندنشده اکنون رفتار دیگری داشته باشد؛ دوباره بررسی کنید.',
  'compat.claudeDesktop.experimental.disabled.summary':
    'این پروفایل پوشهٔ Claude Desktop مخصوص خودش را دارد، اما پروفایل‌های آزمایشی Claude Desktop خاموش‌اند. این پروفایل به‌جای آن با حساب مشترک شما باز نمی‌شود.',
  'compat.claudeDesktop.experimental.guarantee.folder': `Claude Desktop با پوشهٔ همین پروفایل به‌عنوان پوشهٔ داده (${ltr('--user-data-dir')}) اجرا می‌شود و Profile Switcher تأیید می‌کند که برنامهٔ در حال اجرا آن را دریافت کرده است.`,
  'compat.claudeDesktop.experimental.guarantee.untouched':
    'Profile Switcher هیچ‌چیزی را داخل این پوشه یا داده‌های معمول Claude Desktop نمی‌خواند، تغییر نمی‌دهد یا کپی نمی‌کند و هرگز با ورود شما سروکار ندارد.',
  'compat.claudeDesktop.experimental.limitation.undocumented':
    'Anthropic این گزینه را مستند نکرده و از آن پشتیبانی نمی‌کند. ممکن است یک به‌روزرسانی Claude Desktop، یا راه‌اندازی دوبارهٔ خودکار برنامه برای نصب آن، این گزینه را نادیده بگیرد و برنامه با حساب و داده‌های معمول شما باز شود.',
  'compat.claudeDesktop.experimental.limitation.signInCallback': `ورود از طریق مرورگر با یک پیوند ${ltr('claude://')} به Claude Desktop برمی‌گردد که سیستم‌عامل آن را فقط به یکی از نمونه‌های در حال اجرا می‌دهد. ممکن است ورود در پنجرهٔ پروفایل دیگری کامل شود.`,
  'compat.claudeDesktop.experimental.limitation.notVerifiable':
    'Profile Switcher نمی‌تواند ببیند هر پنجرهٔ Claude Desktop با کدام حساب وارد شده است؛ فقط خودتان می‌توانید این را بررسی کنید.',
  'compat.claudeDesktop.experimental.limitation.sharedSystem':
    'هر چیزی که Claude Desktop بیرون از پوشهٔ داده‌اش نگه می‌دارد (مثلاً موارد Keychain سیستم یا فایل‌هایی در پوشهٔ خانگی) ممکن است همچنان بین پروفایل‌ها مشترک باشد.',
  'compat.claudeDesktop.experimental.guidance.signInOneAtATime':
    'هر بار فقط در یک پروفایل وارد شوید: هنگام ورود، پروفایل‌های دیگر Claude Desktop را ببندید.',
  'compat.claudeDesktop.experimental.guidance.check':
    'پس از ورود به هر پروفایل، آن‌ها را ببندید و دوباره باز کنید، مطمئن شوید هرکدام حساب خودش را نشان می‌دهد و سپس بررسی خود را در «جزئیات» ثبت کنید.',
  'compat.appNotFound.summary': '{app} روی این رایانه پیدا نشد.',
  'compat.unknownApp.summary':
    'این پروفایل برای برنامه‌ای («{app}») است که این نسخهٔ Profile Switcher از آن پشتیبانی نمی‌کند.',
  'compat.unsupportedPlatform.summary': '{app} روی این سیستم‌عامل پشتیبانی نمی‌شود.',
  'compat.configError.directoryMissing': 'پوشهٔ این پروفایل دیگر وجود ندارد.',
  'compat.configError.directoryNotDirectory':
    'مسیر پوشهٔ این پروفایل به یک فایل اشاره می‌کند، نه یک پوشه.',
  'compat.configError.workingDirectoryMissing': 'پوشهٔ کاری این پروفایل دیگر وجود ندارد.',
  'compat.guidance.refreshDetection': 'پس از نصب، «تازه‌سازی شناسایی» را بزنید.',
  'compat.guidance.recreateProfile':
    'پوشه را بازگردانید (مثلاً درایو را دوباره وصل کنید) یا یک پروفایل تازه بسازید.',
  'compat.guidance.editWorkingDirectory':
    'پروفایل را ویرایش کنید و یک پوشهٔ کاری موجود انتخاب کنید.',
  'mechanism.claudeCode': `${ltr('CLAUDE_CONFIG_DIR')} (مستندشده توسط Anthropic)`,
  'mechanism.claudeDesktop': 'روش مستندی وجود ندارد',
  'mechanism.claudeDesktop.experimental': `${ltr('--user-data-dir')} (مستندنشده · آزمایشی)`,
  'launch.note.terminalOpened': 'یک پنجرهٔ ترمینال برای این پروفایل باز شد.',
  'launch.note.processStarted': 'فرایند برنامه اجرا شد.',
  'launch.note.sharedLaunch': 'این اجرا از ورود مشترک برنامه استفاده می‌کند.',
  'launch.note.experimentalLaunch':
    'Claude Desktop با پوشهٔ دادهٔ مخصوص این پروفایل اجرا شد (آزمایشی). داخل برنامه بررسی کنید کدام حساب را نشان می‌دهد.',
  'launch.note.notProofOfSignIn':
    'اجرای یک فرایند نشان نمی‌دهد کدام حساب وارد شده است. برای اطمینان از «بررسی» استفاده کنید.',
  'notice.metadataRecoveredFromBackup':
    'فهرست پروفایل‌های شما آسیب دیده بود و از آخرین نسخهٔ پشتیبان بازگردانده شد.',
  'notice.metadataReset':
    'فهرست پروفایل‌های شما خوانا نبود و نسخهٔ پشتیبان قابل‌استفاده‌ای هم وجود نداشت. فایل آسیب‌دیده کنار فایل تازه نگه داشته شد و Profile Switcher با فهرستی خالی شروع کرد. به پوشه‌های پروفایل روی دیسک دست زده نشد.',
  'notice.metadataNewerSchema':
    'فهرست پروفایل‌های شما با نسخهٔ جدیدتری از Profile Switcher ذخیره شده است (قالب {version}). تا وقتی برنامه را به‌روز نکنید، امکان تغییر غیرفعال است.',
};

const errors: Record<ErrorCode, ErrorText> = {
  VALIDATION_FAILED: {
    title: 'برخی از اطلاعات معتبر نیست',
    reason: 'مقدار «{field}» پذیرفته نشد.',
    next: 'آن را اصلاح کنید و دوباره امتحان کنید.',
  },
  PROFILE_NOT_FOUND: {
    title: 'پروفایل پیدا نشد',
    reason: 'شاید پیش‌تر حذف شده باشد.',
    next: 'فهرست تازه شد.',
  },
  DUPLICATE_PROFILE_NAME: {
    title: 'این نام قبلاً استفاده شده است',
    reason: 'نام پروفایل دیگری برای همین برنامه «{name}» است.',
    next: 'نام دیگری انتخاب کنید.',
  },
  UNKNOWN_APPLICATION: {
    title: 'برنامهٔ ناشناخته',
    reason: 'این نسخهٔ Profile Switcher از «{app}» پشتیبانی نمی‌کند.',
    next: 'Profile Switcher را به‌روز کنید یا برنامهٔ دیگری انتخاب کنید.',
  },
  STORAGE_KIND_NOT_SUPPORTED: {
    title: 'این گزینهٔ پوشه در دسترس نیست',
    reason: '{app} از این نوع پوشهٔ پروفایل پشتیبانی نمی‌کند.',
    next: 'یکی از گزینه‌های فهرست را انتخاب کنید.',
  },
  APP_DEFAULT_ALREADY_USED: {
    title: 'پیکربندی پیش‌فرض قبلاً استفاده شده است',
    reason: 'پروفایل دیگری از پیکربندی پیش‌فرض و مشترک {app} استفاده می‌کند.',
    next: 'به‌جای آن برای این پروفایل پوشهٔ مخصوص بسازید.',
  },
  DIRECTORY_NOT_ABSOLUTE: {
    title: 'مسیر پوشه معتبر نیست',
    reason: 'پوشهٔ پروفایل باید یک مسیر کامل روی درایو محلی باشد.',
    next: 'با «انتخاب…» یک پوشه برگزینید.',
  },
  DIRECTORY_IS_FILE: {
    title: 'این مسیر یک فایل است',
    reason: 'پوشهٔ پروفایل باید پوشه باشد.',
    next: 'به‌جای آن یک پوشه انتخاب کنید.',
  },
  DIRECTORY_NOT_EMPTY: {
    title: 'این پوشه از قبل فایل دارد',
    reason:
      'Profile Switcher هرگز فایل‌های موجود را تغییر نمی‌دهد یا حذف نمی‌کند، اما برنامه پیکربندی خود را آنجا می‌خواند و می‌نویسد.',
    next: 'تأیید کنید که با این حال می‌خواهید از آن استفاده کنید، یا یک پوشهٔ خالی انتخاب کنید.',
  },
  DIRECTORY_RESERVED: {
    title: 'از این پوشه نمی‌توان استفاده کرد',
    reason:
      'این پوشه یک مکان سیستمی، پوشهٔ خانگی شما، دادهٔ خود Profile Switcher یا پوشهٔ پیکربندی پیش‌فرض یک برنامه است.',
    next: 'یک پوشهٔ مخصوص برای این پروفایل انتخاب کنید یا بسازید.',
  },
  DIRECTORY_OVERLAPS_PROFILE: {
    title: 'این پوشه با پروفایل دیگری هم‌پوشانی دارد',
    reason:
      'این پوشه همان پوشهٔ پروفایل دیگری است، داخل آن است یا آن را در بر می‌گیرد. پروفایل‌ها داده‌هایشان را به اشتراک می‌گذاشتند.',
    next: 'یک پوشهٔ جداگانه انتخاب کنید.',
  },
  DIRECTORY_CREATE_FAILED: {
    title: 'پوشه ساخته نشد',
    reason: 'ممکن است آن مکان فقط‌خواندنی باشد یا اجازهٔ دسترسی نداشته باشید.',
    next: 'مکان دیگری انتخاب کنید.',
  },
  DIRECTORY_NOT_WRITABLE: {
    title: 'نمی‌توان در این پوشه نوشت',
    reason: 'اجازهٔ نوشتن در این پوشه را ندارید.',
    next: 'پوشه‌ای انتخاب کنید که مالک آن هستید.',
  },
  DIRECTORY_MISSING: {
    title: 'پوشهٔ پروفایل وجود ندارد',
    reason: 'ممکن است جابه‌جا یا حذف شده باشد یا روی درایوی باشد که وصل نیست.',
    next: 'پوشه را بازگردانید یا یک پروفایل تازه بسازید.',
  },
  WORKING_DIRECTORY_INVALID: {
    title: 'پوشهٔ کاری معتبر نیست',
    reason: 'باید یک پوشهٔ موجود با مسیر کامل باشد.',
    next: 'یک پوشهٔ موجود انتخاب کنید.',
  },
  METADATA_READ_FAILED: {
    title: 'دادهٔ پروفایل‌ها خوانده نشد',
    reason: 'فایل باز نشد. اجازه‌های دسترسی پوشه را بررسی کنید.',
    next: 'مکان فایل را در «عیب‌یابی» ببینید.',
  },
  METADATA_WRITE_FAILED: {
    title: 'تغییرات ذخیره نشد',
    reason: 'فهرست پروفایل‌ها نوشته نشد. ممکن است دیسک پر یا فقط‌خواندنی باشد.',
    next: 'کمی فضا آزاد کنید یا اجازه‌ها را بررسی کنید و دوباره امتحان کنید. چیزی تغییر نکرد.',
  },
  METADATA_READ_ONLY: {
    title: 'امکان تغییر غیرفعال است',
    reason: 'فهرست پروفایل‌های شما با نسخهٔ جدیدتری از Profile Switcher ذخیره شده است.',
    next: 'برای اعمال تغییرات، Profile Switcher را به‌روز کنید.',
  },
  APP_NOT_FOUND: {
    title: '{app} پیدا نشد',
    reason: 'ممکن است نصب نباشد یا جایی نصب شده باشد که Profile Switcher در آن جست‌وجو نمی‌کند.',
    next: 'آن را نصب کنید و سپس شناسایی را تازه کنید.',
  },
  APP_UNSUPPORTED_PLATFORM: {
    title: '{app} روی این سیستم‌عامل در دسترس نیست',
    reason: 'سازنده آن را برای این سیستم‌عامل ارائه نمی‌کند.',
    next: 'برنامهٔ دیگری انتخاب کنید.',
  },
  EXECUTABLE_INVALID: {
    title: 'مسیر اجرای ناامن',
    reason: 'یک مسیر نویسه‌هایی دارد که نمی‌توان آن‌ها را به‌صورت امن به ترمینال یا پوسته داد.',
    next: 'برنامه یا پوشه را به مسیری بدون نویسه‌های غیرعادی (مانند گیومه، % یا شکست خط) منتقل کنید.',
  },
  LAUNCH_NOT_AVAILABLE: {
    title: 'این پروفایل اکنون قابل اجرا نیست',
    reason: 'وضعیت آن «{state}» است.',
    next: 'برای دیدن مواردی که نیاز به رسیدگی دارند «جزئیات» را باز کنید.',
  },
  LAUNCH_FAILED: {
    title: 'اجرا ناموفق بود',
    reason: 'سیستم‌عامل نتوانست ترمینال یا برنامه را اجرا کند.',
    next: '«عیب‌یابی» را ببینید و دوباره امتحان کنید. پروفایل شما تغییری نکرده است.',
  },
  TERMINAL_NOT_FOUND: {
    title: 'ترمینالی پیدا نشد',
    reason: 'Profile Switcher برنامهٔ ترمینال انتخاب‌شده را پیدا نکرد.',
    next: 'یک ترمینال نصب کنید، ترمینال دیگری را در تنظیمات برگزینید یا از «رونوشت فرمان» استفاده کنید.',
  },
  SWITCH_CLOSE_FAILED: {
    title: 'پروفایل دیگر بسته نشد',
    reason:
      '{names} پس از درخواست بسته‌شدن خارج نشد. هیچ بستنِ اجباری‌ای انجام نشد و پروفایل جدید هم باز نشد.',
    next: 'خودتان آن را ببندید (شاید برای ذخیرهٔ کار سؤال می‌پرسد)، یا «اجرا در کنار آن» را انتخاب کنید.',
  },
  VERIFICATION_NOT_SUPPORTED: {
    title: 'بررسی در دسترس نیست',
    reason: 'این برنامه گزارش نمی‌دهد از کدام پیکربندی استفاده می‌کند.',
    next: 'یادداشت‌های سازگاری این برنامه را ببینید.',
  },
  VERIFICATION_FAILED: {
    title: 'بررسی ناموفق بود',
    reason:
      'برنامه وضعیت قابل‌خواندنی برنگرداند ({reason}). نسخه‌های قدیمی‌تر ممکن است از آن پشتیبانی نکنند.',
    next: 'برنامه را به‌روز کنید و دوباره امتحان کنید.',
  },
  OPEN_FOLDER_FAILED: {
    title: 'پوشه باز نشد',
    reason: 'مدیر فایل برای این مکان باز نشد.',
    next: 'مسیر کامل را در «جزئیات» ببینید.',
  },
  LINK_NOT_ALLOWED: {
    title: 'پیوند مسدود شد',
    reason: 'فقط فهرست ثابتی از پیوندهای پروژه و مستندات قابل باز شدن است.',
    next: 'نیازی به کاری نیست.',
  },
  FORBIDDEN_SENDER: {
    title: 'درخواست مسدود شد',
    reason: 'این درخواست از پنجرهٔ خود Profile Switcher نیامده بود.',
    next: 'Profile Switcher را دوباره اجرا کنید.',
  },
  INTERNAL_ERROR: {
    title: 'مشکلی پیش آمد',
    reason: 'خطای پیش‌بینی‌نشده‌ای رخ داد. جزئیات در گزارش محلی نوشته شد.',
    next: 'دوباره امتحان کنید. اگر تکرار شد، «عیب‌یابی» را در گزارش اشکال کپی کنید.',
  },
};

export const fa: Catalog = {
  locale: 'fa-IR',
  messages,
  errors,
  ui: {
    appName: 'Profile Switcher',
    nav: {
      profiles: 'پروفایل‌ها',
      settings: 'تنظیمات',
      diagnostics: 'عیب‌یابی',
      label: 'اصلی',
      skip: 'رفتن به محتوای اصلی',
    },
    common: {
      cancel: 'انصراف',
      close: 'بستن',
      save: 'ذخیره',
      saving: 'در حال ذخیره…',
      create: 'ساخت پروفایل',
      creating: 'در حال ساخت…',
      delete: 'حذف',
      edit: 'ویرایش',
      details: 'جزئیات',
      choose: 'انتخاب…',
      clear: 'پاک کردن',
      copy: 'رونوشت',
      copied: 'در کلیپ‌بورد کپی شد',
      refresh: 'تازه‌سازی',
      loading: 'در حال بارگذاری…',
      dismiss: 'بستن پیام',
      notSet: 'تنظیم نشده',
      never: 'هرگز',
      yes: 'بله',
      no: 'خیر',
      unknown: 'نامشخص',
    },
    states: {
      Supported: 'پشتیبانی‌شده',
      Unsupported: 'پشتیبانی‌نشده',
      NeedsVerification: 'نیاز به بررسی',
      ApplicationNotFound: 'نصب نیست',
      ConfigurationError: 'خطای پیکربندی',
    },
    isolation: {
      isolated: 'مجزا',
      experimental: 'پوشهٔ مخصوص · آزمایشی',
      shared: 'مشترک · مجزا نیست',
    },
    storageKinds: {
      managed: 'پوشه‌ای که Profile Switcher مدیریت می‌کند',
      custom: 'پوشه‌ای که خودم انتخاب می‌کنم',
      'app-default': 'پیکربندی پیش‌فرض برنامه',
    },
    storageHelp: {
      managed: 'پیشنهادی. یک پوشهٔ تازه و خالی برای این پروفایل ساخته می‌شود.',
      custom:
        'از پوشه‌ای که انتخاب می‌کنید استفاده می‌شود. نباید با پروفایل دیگری هم‌پوشانی داشته باشد.',
      'app-default':
        'مجزا نیست. همان تنظیمات و ورودی را به کار می‌برد که اجرای معمولی برنامه به کار می‌برد.',
    },
    colors: {
      slate: 'خاکستری',
      blue: 'آبی',
      violet: 'بنفش',
      green: 'سبز',
      amber: 'کهربایی',
      rose: 'سرخ',
      teal: 'فیروزه‌ای',
      orange: 'نارنجی',
    },
    dashboard: {
      title: 'پروفایل‌ها',
      subtitle: 'ابزارها را با پیکربندی و ورود مخصوص خودشان اجرا کنید.',
      newProfile: 'پروفایل تازه',
      refreshDetection: 'تازه‌سازی شناسایی',
      filterAll: 'همه',
      filterLabel: 'پالایش بر اساس برنامه',
      lastLaunched: 'آخرین اجرا {time}',
      lastLaunchFailed: 'آخرین اجرا ناموفق بود {time}',
      neverLaunched: 'هنوز اجرا نشده',
      lastUsedBadge: 'آخرین اجرا',
      launch: 'اجرا',
      launchShared: 'باز کردن (مشترک)',
      launching: 'در حال اجرا…',
      copyCommand: 'رونوشت فرمان',
      readOnly: 'فقط‌خواندنی: امکان تغییر غیرفعال است.',
      empty: 'هنوز پروفایلی برای این برنامه وجود ندارد.',
      experimentalBadge: 'آزمایشی',
    },
    firstRun: {
      title: 'نخستین پروفایل‌هایتان را بسازید',
      body: 'هر پروفایل پوشهٔ پیکربندی مخصوص خودش را می‌گیرد، بنابراین می‌توانید در هرکدام با حساب متفاوتی وارد شوید. Profile Switcher هرگز گذرواژه یا توکن شما را نمی‌بیند یا ذخیره نمی‌کند؛ ورود را خود برنامه انجام می‌دهد.',
      chooseApp: 'برنامه',
      templatesTitle: 'شروع با الگوها',
      templatesBody:
        'دو پروفایل «شخصی» و «کاری» می‌سازد که هرکدام پوشهٔ خالی خودش را دارد. پس از اجرا، در هرکدام جداگانه وارد شوید.',
      createTemplates: 'ساخت «شخصی» و «کاری»',
      custom: 'به‌جای آن یک پروفایل سفارشی بسازید',
      noIsolatedApps:
        'هیچ‌کدام از برنامه‌های پشتیبانی‌شده روی این رایانه روش مستندی برای جداسازی پروفایل ندارد.',
      templatePersonal: 'شخصی',
      templateWork: 'کاری',
      templatesCreated: 'پروفایل‌های «شخصی» و «کاری» ساخته شدند.',
    },
    form: {
      createTitle: 'پروفایل تازه',
      editTitle: 'ویرایش پروفایل',
      name: 'نام',
      namePlaceholder: 'مثلاً کاری، مشتری الف، شخصی',
      application: 'برنامه',
      applicationLocked: 'پس از ساخت پروفایل نمی‌توان برنامهٔ آن را تغییر داد.',
      color: 'رنگ',
      description: 'توضیحات',
      descriptionPlaceholder: 'یادداشت اختیاری، مثلاً با کدام حساب وارد شوید',
      storage: 'پوشهٔ پیکربندی',
      storageLocked:
        'پس از ساخت نمی‌توان پوشه را تغییر داد، چون این کار ورودی را که پروفایل استفاده می‌کند عوض می‌کند. به‌جای آن پروفایل تازه‌ای بسازید.',
      customPath: 'پوشه',
      chooseProfileFolder: 'انتخاب پوشهٔ پروفایل',
      chooseWorkingDirectory: 'انتخاب پوشهٔ کاری',
      noFolderChosen: 'پوشه‌ای انتخاب نشده',
      allowNonEmpty: 'با اینکه این پوشه فایل دارد، از آن استفاده شود',
      allowNonEmptyHelp: 'Profile Switcher هرگز فایل‌های موجود را تغییر نمی‌دهد یا حذف نمی‌کند.',
      workingDirectory: 'شروع در پوشهٔ',
      workingDirectoryHelp: 'پوشه‌ای که ترمینال در آن باز می‌شود. پیش‌فرض، پوشهٔ خانگی شماست.',
      advanced: 'پیشرفته',
      inheritCredentialEnv: 'عبور دادن متغیرهای محیطی اعتبارنامه',
      inheritCredentialEnvHelp: `به‌طور پیش‌فرض خاموش است. اگر روشن باشد، متغیرهایی مانند ${ltr('ANTHROPIC_API_KEY')} به برنامه می‌رسند و بر ورود خود این پروفایل اولویت پیدا می‌کنند.`,
      isolationDocumented: 'جداسازی: {mechanism}',
      isolationNotDocumented: 'جداسازی: پشتیبانی نمی‌شود',
      experimentalStorage:
        'آزمایشی: Claude Desktop به‌طور رسمی از پوشه‌های جداگانه پشتیبانی نمی‌کند. پیش از تکیه بر آن، یادداشت‌های پروفایل را بخوانید.',
      detected: 'نصب‌شده{version}',
      notDetected: 'پیدا نشد',
      unsupportedPlatform: 'روی این سیستم‌عامل در دسترس نیست',
      errors: {
        nameRequired: 'یک نام وارد کنید.',
        nameTooLong: 'حداکثر {max} نویسه وارد کنید.',
        nameInvalid: 'نویسه‌های کنترلی یا تغییر جهت متن را حذف کنید.',
        nameDuplicate: 'پروفایل دیگری از {app} همین نام را دارد.',
        descriptionTooLong: 'حداکثر {max} نویسه وارد کنید.',
        descriptionInvalid: 'نویسه‌های کنترلی را حذف کنید.',
        folderRequired: 'یک پوشه انتخاب کنید.',
      },
      created: 'پروفایل «{name}» ساخته شد.',
      saved: 'تغییرات «{name}» ذخیره شد.',
    },
    details: {
      title: 'جزئیات پروفایل',
      status: 'وضعیت',
      guaranteed: 'چه چیزی تضمین می‌شود',
      notGuaranteed: 'چه چیزی تضمین نمی‌شود',
      nextSteps: 'گام‌های بعدی',
      folder: 'پوشهٔ پیکربندی',
      folderAppDefault: 'پیش‌فرض برنامه (Profile Switcher آن را مدیریت نمی‌کند)',
      workingDirectory: 'شروع در',
      mechanism: 'روش جداسازی',
      openFolder: 'باز کردن پوشه',
      verify: 'بررسی',
      verifying: 'در حال بررسی…',
      verifyHelp:
        'برنامهٔ نصب‌شده را اجرا می‌کند تا گزارش دهد برای این پروفایل از کدام پوشه و حساب استفاده می‌کند. چیزی ذخیره نمی‌شود.',
      verificationTitle: 'نتیجهٔ بررسی',
      verifiedFolderMatch: 'برنامه پوشهٔ همین پروفایل را گزارش می‌دهد. جداسازی پیکربندی تأیید شد.',
      verifiedFolderMismatch: 'برنامه پوشهٔ دیگری را گزارش می‌دهد: {folder}',
      signInLabel: 'ورود',
      signedIn: 'وارد شده',
      signedOut: 'وارد نشده',
      signInUnknown: 'وضعیت ورود گزارش نشد',
      account: 'حساب',
      organization: 'سازمان',
      plan: 'طرح',
      authMethod: 'روش',
      strippedVariables: 'برای این اجرا حذف شد: {variables}',
      notStored:
        'فقط برای همین جلسه نمایش داده می‌شود و Profile Switcher هرگز آن را ذخیره نمی‌کند.',
      copyCommandTitle: 'خودتان اجرا کنید',
      copyCommandHelp: 'فرمانی را کپی می‌کند که برنامه را با پیکربندی همین پروفایل اجرا می‌کند.',
      shellLabel: 'پوسته',
      shells: {
        posix: 'bash / zsh / sh',
        fish: 'fish',
        powershell: 'PowerShell',
        cmd: 'Command Prompt',
      },
      sessionScoped:
        'متغیرها را برای جلسهٔ فعلی پوسته تنظیم می‌کند؛ بهتر است در پنجرهٔ تازه اجرا شود.',
      lastLaunch: 'آخرین اجرا',
      created: 'تاریخ ساخت',
      appVersion: 'نسخه',
      manualCheck: {
        title: 'بررسی خود شما',
        help: 'Profile Switcher نمی‌تواند بفهمد Claude Desktop از کدام حساب استفاده می‌کند. پس از انجام گام‌های بالا، ثبت کنید که این پروفایل را بررسی کرده‌اید. این ثبت فقط برای نسخهٔ فعلی Claude Desktop معتبر است.',
        none: 'هنوز بررسی نشده است.',
        checked: 'شما این پروفایل را {time} با Claude Desktop {version} بررسی کردید.',
        unknownVersion: '(نسخهٔ نامشخص)',
        mark: 'این پروفایل را بررسی کردم',
        clear: 'حذف بررسی من',
        saved: 'بررسی شما ثبت شد.',
        cleared: 'بررسی شما حذف شد.',
      },
    },
    delete: {
      title: '«{name}» حذف شود؟',
      body: 'این پروفایل از Profile Switcher حذف می‌شود.',
      keepsData:
        'پوشهٔ پیکربندی آن، همراه با هر ورود و تاریخچه‌ای که در آن ذخیره شده، حذف نمی‌شود و در این مسیر می‌ماند:',
      noData: 'این پروفایل از پیکربندی پیش‌فرض برنامه استفاده می‌کند که تغییری نمی‌کند.',
      confirm: 'حذف پروفایل',
      deleted: '«{name}» حذف شد. پوشهٔ آن روی دیسک باقی ماند.',
      deletedNoFolder: '«{name}» حذف شد.',
    },
    runtime: {
      running: 'در حال اجرا',
      runningMany: 'در حال اجرا · {count} نمونه',
      folderConfirmed: 'پوشه تأیید شد',
      folderMismatch: 'با پوشهٔ پیکربندی دیگری در حال اجراست',
      starting: 'در حال شروع…',
      unconfirmed: 'اجرا شد · در حال اجرا بودنش تأیید نشد',
      untracked: 'اجرا شد · وضعیت اجرا پیگیری نمی‌شود',
      pidTitle: 'شناسهٔ فرایند {pids}',
      instancesTitle: 'نمونه‌های در حال اجرا',
      instancesHelp:
        'هر اجرا مستقل است. Profile Switcher این‌ها را فقط در حالت جابه‌جایی و پس از تأیید شما می‌بندد؛ در غیر این صورت آن‌ها را در پنجرهٔ خودشان ببندید.',
      none: 'نمونهٔ در حال اجرایی شناسایی نشد.',
      states: {
        starting: 'در حال شروع',
        running: 'در حال اجرا',
        unconfirmed: 'تأییدنشده',
        untracked: 'پیگیری‌نشده',
      },
      folder: {
        verified: 'پوشه از روی فرایند در حال اجرا تأیید شد',
        mismatch: 'فرایند در حال اجرا پوشهٔ دیگری را گزارش می‌دهد',
        'not-checked':
          'پوشه هنگام اجرا تنظیم شد (این سیستم‌عامل محیط فرایندها را در اختیار نمی‌گذارد)',
      },
      pid: 'شناسهٔ فرایند {pid}',
      started: 'شروع {time}',
    },
    switchDialog: {
      title: 'جابه‌جایی به «{name}»؟',
      body: 'حالت جابه‌جایی برای {app} روشن است. این پروفایل‌ها در حال اجرا هستند و پیش از باز شدن «{name}» از آن‌ها خواسته می‌شود بسته شوند:',
      instance: '{profile} · شناسهٔ فرایند {pid}',
      warning:
        'از آن‌ها به‌شکل عادی خواسته می‌شود بسته شوند، مثل وقتی که پنجره‌شان را می‌بندید؛ هیچ بستنِ اجباری‌ای انجام نمی‌شود. ممکن است کارهای ذخیره‌نشده از دست برود و جلسه‌های Claude Code در آن‌ها پایان یابد.',
      untracked:
        'این پروفایل‌ها هم ممکن است باز باشند، اما Profile Switcher نمی‌تواند آن‌ها را ببندد: {names}',
      close: 'بستن و باز کردن «{name}»',
      alongside: 'اجرا در کنار آن',
      closing: 'در حال بستن…',
    },
    launch: {
      success: '«{name}» در {terminal} اجرا شد.',
      switched: '{closed} بسته شد و «{name}» باز شد.',
      successDirect: '{app} برای «{name}» باز شد.',
      commandCopied: 'فرمان اجرای «{name}» کپی شد. آن را در ترمینال بچسبانید.',
    },
    settings: {
      title: 'تنظیمات',
      appearance: 'ظاهر',
      theme: 'پوسته',
      themes: { system: 'سیستم', light: 'روشن', dark: 'تیره' },
      language: 'زبان',
      languages: { en: 'English', fa: 'فارسی' },
      languageHelp: 'می‌توانید زبان‌های دیگری هم اضافه کنید؛ CONTRIBUTING.md را ببینید.',
      launchBehavior: 'برنامه‌های خط فرمان',
      launchBehaviorLabel: 'کار اصلی دکمه',
      behaviors: {
        'open-terminal': 'باز کردن پنجرهٔ ترمینال تازه',
        'copy-command': 'کپی فرمان اجرا در کلیپ‌بورد',
      },
      terminal: 'ترمینال',
      terminals: {
        auto: 'خودکار',
        'macos-terminal': 'Terminal',
        iterm: 'iTerm',
        'x-terminal-emulator': 'پیش‌فرض سیستم (x-terminal-emulator)',
        'gnome-terminal': 'GNOME Terminal',
        konsole: 'Konsole',
        'xfce4-terminal': 'Xfce Terminal',
        kitty: 'kitty',
        alacritty: 'Alacritty',
        wezterm: 'WezTerm',
        foot: 'foot',
        xterm: 'XTerm',
        'windows-console': 'کنسول ویندوز',
      },
      launchModes: 'اجرای چند پروفایل',
      launchModesHelp:
        'وقتی پروفایلی را اجرا می‌کنید و پروفایل‌های دیگری از همان برنامه در حال اجرا هستند، چه اتفاقی بیفتد.',
      modes: {
        concurrent: 'اجرای همزمان در کنار هم',
        switch: 'جابه‌جایی: پیشنهاد بستن بقیه پیش از اجرا',
      },
      modeHelp: {
        concurrent: 'پروفایل در کنار پروفایل‌های در حال اجرا باز می‌شود. چیزی بسته نمی‌شود.',
        switch:
          'Profile Switcher پروفایل‌های دیگرِ در حال اجرا را نشان می‌دهد و فقط پس از تأیید شما آن‌ها را می‌بندد. از آن‌ها به‌شکل عادی خواسته می‌شود بسته شوند؛ هیچ بستنِ اجباری‌ای انجام نمی‌شود.',
      },
      windowsSwitchNote:
        'در ویندوز نمی‌توان از Claude Code داخل پنجرهٔ کنسول خواست بسته شود؛ از شما خواسته می‌شود خودتان آن را ببندید.',
      experimental: 'آزمایشی',
      experimentalHelp:
        'قابلیت‌هایی که به رفتار مستندنشدهٔ برنامه‌های دیگر وابسته‌اند. به‌طور پیش‌فرض خاموش‌اند و ممکن است پس از به‌روزرسانی آن برنامه‌ها از کار بیفتند.',
      claudeDesktopIsolation: 'پروفایل‌های جداگانهٔ Claude Desktop',
      claudeDesktopIsolationHelp: `به پروفایل‌های Claude Desktop اجازه می‌دهد پوشهٔ مخصوص خودشان را داشته باشند تا چند حساب در کنار هم اجرا شوند. این قابلیت از گزینهٔ ${ltr('--user-data-dir')} در Chromium استفاده می‌کند که Anthropic آن را مستند نکرده و از آن پشتیبانی نمی‌کند: ممکن است یک به‌روزرسانی آن را از کار بیندازد، ورود از مرورگر ممکن است در پنجرهٔ اشتباه کامل شود و Profile Switcher نمی‌تواند تأیید کند هر پنجره از کدام حساب استفاده می‌کند.`,
      claudeDesktopIsolationToggle: 'روشن کردن (خطرهای بالا را می‌پذیرم)',
      claudeDesktopIsolationOffNote:
        'خاموش کردن، پروفایل‌های Claude Desktop و پوشه‌هایشان را نگه می‌دارد، اما تا وقتی دوباره روشن نشود نمی‌توان آن‌ها را باز کرد.',
      applications: 'برنامه‌ها',
      notFound: 'پیدا نشد',
      unsupported: 'روی این سیستم‌عامل در دسترس نیست',
      foundAt: 'پیداشده در {path}',
      checkedAt: 'بررسی {time}',
      about: 'درباره',
      version: 'نسخه',
      runtime: 'محیط اجرا',
      license: 'مجوز',
      licenseValue: 'MIT · رایگان و متن‌باز',
      privacy: 'حریم خصوصی',
      privacyValue: 'فقط محلی. بدون تله‌متری، تحلیل، حساب کاربری یا همگام‌سازی ابری.',
      links: {
        repository: 'کد منبع',
        issues: 'گزارش مشکل',
        license: 'مجوز',
        security: 'سیاست امنیتی',
        compatibility: 'یادداشت‌های سازگاری',
      },
      saved: 'تنظیمات ذخیره شد.',
    },
    diagnostics: {
      title: 'عیب‌یابی',
      subtitle:
        'اطلاعات محلی برای رفع اشکال. نام پروفایل‌ها، جزئیات حساب و مقدار متغیرها هرگز در آن نیست. متن گزارش برای استفاده در گزارش اشکال به انگلیسی است.',
      copy: 'رونوشت عیب‌یابی',
      openLogs: 'باز کردن پوشهٔ گزارش‌ها',
      envWarningTitle: 'متغیرهای اعتبارنامه شناسایی شد',
      envWarning:
        'Profile Switcher با متغیرهای {variables} اجرا شده است. این متغیرها هنگام اجرای پروفایل‌ها حذف می‌شوند، مگر اینکه پروفایلی عبور دادن آن‌ها را روشن کرده باشد.',
      providerWarning:
        'متغیرهای ارائه‌دهنده فعال‌اند: {variables}. ممکن است ورود جداگانهٔ هر پروفایل برای Claude Code اعمال نشود.',
    },
    errorBoundary: {
      title: 'رابط کاربری با خطای پیش‌بینی‌نشده‌ای روبه‌رو شد',
      body: 'پروفایل‌های شما سالم‌اند و چیزی تغییر نکرد. برای ادامه دوباره بارگذاری کنید.',
      reload: 'بارگذاری دوباره',
    },
    loadFailed: 'Profile Switcher نتوانست پروفایل‌های شما را بارگذاری کند.',
    retry: 'دوباره امتحان کنید',
    whatHappened: 'چه اتفاقی افتاد',
    whatNext: 'چه کاری می‌توانید بکنید',
  },
};
