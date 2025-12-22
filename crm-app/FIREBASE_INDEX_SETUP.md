# הוראות הגדרת Firebase Indexes

## הבעיה
האפליקציה מנסה לבצע queries מורכבות ב-Firestore שדורשות אינדקסים מורכבים (composite indexes).

## הפתרון - 3 אפשרויות

### אפשרות 1: לחיצה על הקישורים (הכי פשוט!)
Firebase נותן לך קישור ישיר ליצירת האינדקס. **פשוט לחץ על הקישור בשגיאה**:

```
https://console.firebase.google.com/v1/r/project/crm-lite-neshama/firestore/indexes?create_composite=...
```

לחץ על כל קישור ש-Firebase מציג בקונסול, ואישור את יצירת האינדקס.

---

### אפשרות 2: יצירה ידנית בקונסול

1. **גש ל-Firebase Console:**
   https://console.firebase.google.com/project/crm-lite-neshama/firestore/indexes

2. **לחץ על "Create Index"**

3. **הוסף את האינדקסים הבאים:**

#### אינדקס 1: source + status + fullName
- Collection: `contacts`
- Fields:
  - `source` - Ascending
  - `status` - Ascending
  - `fullName` - Ascending

#### אינדקס 2: status + fullName
- Collection: `contacts`
- Fields:
  - `status` - Ascending
  - `fullName` - Ascending

#### אינדקס 3: source + fullName
- Collection: `contacts`
- Fields:
  - `source` - Ascending
  - `fullName` - Ascending

4. **לחץ "Create" וחכה לבניית האינדקס** (לוקח בדרך כלל 2-5 דקות)

---

### אפשרות 3: דרך Firebase CLI (מתקדם)

```bash
# התקנת Firebase CLI (אם עוד לא מותקן)
npm install -g firebase-tools

# התחברות ל-Firebase
firebase login

# אתחול הפרויקט (במקרה הראשון בלבד)
firebase init firestore

# פריסת האינדקסים
firebase deploy --only firestore:indexes --project crm-lite-neshama
```

---

## בדיקת סטטוס האינדקסים

1. גש ל: https://console.firebase.google.com/project/crm-lite-neshama/firestore/indexes
2. ודא שכל האינדקסים במצב **"Enabled"** (ולא "Building")
3. אם הסטטוס הוא "Building" - חכה כמה דקות

---

## עדכון לאחר יצירת האינדקסים

אחרי שהאינדקסים נוצרו והם במצב "Enabled":

1. **רענן את הדפדפן** (F5 או Ctrl+R)
2. **נקה Cache** (Ctrl+Shift+Delete → Cache)
3. **בדוק שהשגיאות נעלמו** מה-Console

---

## הערות חשובות

- **זמן בנייה:** כל אינדקס לוקח 2-10 דקות להיבנות (תלוי בכמות הנתונים)
- **סטטוס:** ניתן לראות את הסטטוס ב-Firebase Console → Firestore → Indexes
- **חד פעמי:** צריך לעשות את זה רק פעם אחת לכל פרויקט

---

## קובץ האינדקסים

האינדקסים מוגדרים גם ב: `firestore.indexes.json`

זה שימושי לגיבוי ולפריסה אוטומטית בעתיד.

---

**תאריך:** 2025-12-21
**פרויקט:** CRM-lite נשמה
