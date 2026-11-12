# Design Card — מרחב הניהול: CRM (היום, אנשי קשר, כרטיס אדם, תורמים, משימות, חשבונות)

skill: ui-design-thinking
date: 2026-11-12
screens: shots/{today,contacts,person,donors,tasks,accounting,campaigns,reports,settings,flows}-{390,1280}.png

1. What is this surface? היום = מסך מיקוד (מה מחכה לי). אנשי קשר / תורמים = כלי (רשימה לחיפוש ופתיחה). כרטיס אדם = תמונת מצב של אדם + פעולות. משימות = רשימת ביצוע (checklist, לא לוח זמנים). חשבונות = תמונת מצב של מודול נפרד + קישורים.
2. The one thing seen first: בכל מסך כפתור נחושת אחד — הפעולה על הפריט הדחוף ביותר (חיוג למשימה באיחור; "איש קשר חדש" ברשימה). באיחור מופיע ראשון.
3. Info vs action: השתייכויות, סטטוסים והסכמות הם טקסט רגיל, לא צ'יפים. אזהרה = טקסט בצבע נחושת עם מילים ("באיחור מיום שני", "אין אחראי/ת"), אף פעם לא צבע לבד. כפתורים: חיוג, WhatsApp, בוצע, שיוך. קישורים מסומנים בקו תחתון ואומרים לאן ("לכל המשימות", "לחשבונות").
4. Groups by meaning: משימות לפי זמן (באיחור / היום / השבוע); בכרטיס אדם — קשר (משימות + ציר זמן) בעמודה אחת, עובדות (תרומות, לימוד, הסכמות) בעמודה שנייה. מקור חיצוני מסומן ("מהנקודה שלי").
5. Repeated structure: כותרת ← רשימה, בכל המסכים. אין כרטיסי מדדים ב"היום"; מספר מופיע רק ליד כותרת הרשימה שהוא סופר. בתורמים — שורת סיכום אחת, ומדד בלי מקור מאומת כתוב במילים.
6. Borrowed pattern: מרחב הניהול של הנקודה שלי (MGMT-DESIGN-20261023: פאנל לבן על נייר חם, כפתור נחושת יחיד, סרגל תחתון בטלפון ופס צד במחשב). רשימת משימות — Google Tasks. טבלת אנשי קשר — Google Contacts.
7. Direction / time: RTL; ציר זמן אנכי, תאריך מימין וטקסט משמאלו; משימות הן checklist ולא יומן.
8. Typography: Heebo בלבד, שלושה גדלים (כותרת מסך, כותרת פאנל, גוף), מספרי טלפון וכתובות מבודדים כ-LTR.

Blurry-eyes check: בטלפון רואים ערימת פאנלים לבנים עם כותרת מודגשת וכפתור נחושת אחד למעלה; במחשב — פס ניווט מימין וטבלה אחת. הפריט הדחוף בולט בלי לקרוא. חולשה ידועה: ב"היום" במחשב יש שלושה כפתורי מסגרת בשורה לכל משימה — לבדוק מול מבקר רענן לפני בנייה.

## Added 2026-11-12: campaigns, reports, settings, flows

- קמפיינים = כלי בשלבים (קהל ← בדיקת קהל ← הודעה ← אישור). הדבר האחד: כמה אנשים יקבלו בפועל ולמה אחרים לא. השליחה עצמה באיתערותא.
- דוחות = אינדקס (כותרת ← רשימה), בלי כפתור נחושת. דוח בלי מקור מאומת אפור ובלי קישור.
- הגדרות והרשאות = מי רשאי לעשות מה + יומן פעולות רגישות. הרשאה טכנית נפרדת משיוך ארגוני.
- flows = דף עזר: סינון, איש קשר חדש (שגיאת כפילות), תצוגה מקדימה למיזוג, תיעוד תוצאה, ריק / טעינה / כשל חלקי / אין הרשאה.

## Independent critic pass 2026-11-12 (Sonnet, read-only, all 20 shots)

Applied: כפתור נחושת אחד בלבד במשימות ובקמפיינים; מספרים עקביים בין היום / משימות / תורמים / כרטיס אדם; "בשבוע הבא" במקום "השבוע"; שם שפותח כרטיס הוא קישור בכל הטבלאות; אזהרה בנחושת גם בטלפון; כפתור שורה אחיד; עמודת "קביעות" הוחלפה ב"תרומות בתקופה" (אין מקור מאומת לקביעות); ניסוח סינון ומיזוג; תאריך ביטול מיזוג; מצב הספרים.
Open (not applied, to decide before build): במחשב הפעולה רחוקה מהשם בשורות רחבות (hover/zebra); "בוצע" ככפתור ב"היום" מול תיבת סימון ב"משימות"; תגית "מרחב הניהול" נראית כמו כפתור (ירושה מערכת הנקודה שלי); גלילת לשוניות וצ'יפים בטלפון בלי רמז; שבירת שורה בין מספר לשם העצם; תג המספר מכסה את אייקון "היום"; אזור לחיצה קטן לשם בתוך שורה.

## Owner review 2026-11-12 — direction approved in principle; four fixes applied

1. רמז לגלילה אופקית בטלפון: הקצה הרחוק של שורת המסננים דוהה והפריט האחרון נחתך באמצע מילה. בכרטיס האדם ויתרנו על שורת הלשוניות בטלפון (המקטעים מתקפלים במקומה).
2. "בוצע" אחיד: תיבת סימון בתחילת השורה במסך היום, במשימות ובכרטיס האדם; סדר אחיד "משימה · שם".
3. שטח לחיצה: שם שפותח כרטיס הוא קישור עם אזור לחיצה של 44 פיקסלים; במחשב שורה מודגשת במעבר עכבר.
4. כרטיס אדם בטלפון: פעולות מהירות, משימות פתוחות ושלושה אירועים אחרונים למעלה; תרומות, לימוד, פרטים והסכמות מקופלים לשורת סיכום. גובה המסך ירד מכ־2,050 לכ־1,100 פיקסלים.

Still open: תגית "מרחב הניהול" נראית כמו כפתור (ירושה מהנקודה שלי); תג המספר מכסה חלק מאייקון "היום"; שבירת שורה בין מספר לשם עצם בשני מקומות; במחשב הפעולה רחוקה מהשם בשורות רחבות (הדגשת שורה במעבר עכבר נוספה, לא נראית בצילום).

## Sign-in screen (owner request 2026-11-12)

What it is: one action, signing in. The one thing: the copper "כניסה" button. Labels above the fields (information is not a placeholder); logo and area name as the only heading; "שכחתי סיסמה" is a quiet link. The note "Google sign-in is not configured" is removed: it is not something the person can act on. Pattern borrowed from the usual sign-in card (Google / Microsoft).

## WhatsApp section on the person card (owner approval 2026-11-12)

What it is: information, not an action; the action stays the existing "וואטסאפ" button above it. The one thing: when the last contact was. Two plain rows (קשר אחרון, הודעה אחרונה) in the same heading → list structure as the other panels. "ייתכן שממתין למענה" is quiet text beside the direction, never a badge or a task: the other side writing last does not prove a reply is owed. The heading carries "אישי · רק לך" because the source is the owner's personal WhatsApp; the server answers the owner alone and everyone else sees no section at all. No match is worded "אין היסטוריית קשר זמינה", not as zero messages.
