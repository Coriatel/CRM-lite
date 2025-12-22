# 🔐 הגדרת Google OAuth ל-Google Contacts

כדי להשתמש בסנכרון Google Contacts, צריך להגדיר Google OAuth Client ID.

---

## 📋 שלבים:

### 1. היכנס ל-Google Cloud Console
גש ל: https://console.cloud.google.com/

### 2. צור פרויקט חדש (אם אין לך)
1. לחץ על הפרויקט למעלה
2. לחץ "New Project"
3. תן שם: "CRM Lite Neshama"
4. לחץ "Create"

### 3. הפעל את Google People API
1. לך ל: https://console.cloud.google.com/apis/library
2. חפש "Google People API"
3. לחץ עליו
4. לחץ "Enable"

### 4. צור OAuth 2.0 Client ID
1. לך ל: https://console.cloud.google.com/apis/credentials
2. לחץ "+ CREATE CREDENTIALS"
3. בחר "OAuth client ID"
4. אם מבקשים, הגדר "OAuth consent screen":
   - User Type: External
   - App name: CRM Lite Neshama
   - User support email: [האימייל שלך]
   - Developer contact: [האימייל שלך]
   - לחץ "Save and Continue"
   - Scopes: Skip (אנחנו נגדיר ידנית)
   - Test users: הוסף את עצמך אם בסביבת טסט
   - לחץ "Save and Continue"

5. חזור ל-Credentials ויצירת OAuth Client ID:
   - Application type: **Web application**
   - Name: "CRM Lite Web Client"
   - **Authorized JavaScript origins:**
     - http://localhost:4180 (לפיתוח)
     - https://YOUR_DOMAIN.com (לפרודקשן)
   - **Authorized redirect URIs:**
     - http://localhost:4180 (לפיתוח)
     - https://YOUR_DOMAIN.com (לפרודקשן)
   - לחץ "Create"

6. **העתק את Client ID** שנוצר

### 5. הוסף ל-.env
1. פתח את הקובץ: `crm-app/.env`
2. החלף את `YOUR_GOOGLE_CLIENT_ID_HERE` ב-Client ID שהעתקת:
   ```
   VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijk.apps.googleusercontent.com
   ```
3. שמור את הקובץ

### 6. הפעל מחדש את השרת
```bash
cd crm-app
npm run build
npm run preview
```

---

## ✅ בדיקה

1. פתח את האפליקציה: http://localhost:4180
2. לחץ על כפתור הסנכרון (🔄) בכותרת
3. לחץ "התחבר עם Google"
4. אשר את ההרשאות
5. בחר אנשי קשר לייבוא

---

## 🔒 אבטחה

- הגדרת "External" ב-OAuth consent screen פירושה שכל אחד יכול להשתמש באפליקציה
- אם רוצה להגביל, עבור ל: https://console.cloud.google.com/apis/credentials/consent
- הוסף משתמשים ב-"Test users" בזמן פיתוח

---

## 🐛 פתרון בעיות

### שגיאה: "Origin mismatch"
- ודא שה-Origin ב-Google Console תואם למה שאתה משתמש
- אם השרת רץ על פורט אחר, הוסף אותו ל-Authorized origins

### שגיאה: "Access blocked: This app's request is invalid"
- ודא שהפעלת את Google People API
- ודא שהגדרת OAuth consent screen

### שגיאה: "idpiframe_initialization_failed"
- נקה cookies ו-cache של Google
- נסה דפדפן אחר או incognito mode

---

## 📚 מידע נוסף

- Google People API Docs: https://developers.google.com/people
- OAuth 2.0 Guide: https://developers.google.com/identity/protocols/oauth2

---

**תאריך:** 2025-12-22
**גרסה:** 1.0
