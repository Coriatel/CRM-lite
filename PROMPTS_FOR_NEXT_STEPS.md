# Prompts להמשך פיתוח - CRM Lite נשמה
## מדריך לעבודה עם Claude (Sonnet)

---

# 📋 סדר העבודה המומלץ

| שלב | תיאור | מודל | Prompt |
|-----|-------|------|--------|
| 1 | בדיקות + תיקון באגים | Sonnet | [Prompt 1](#prompt-1---בדיקות-ותיקון-באגים) |
| 2 | השלמת CSS | Sonnet | [Prompt 2](#prompt-2---השלמת-css) |
| 3 | אבטחה בסיסית | Sonnet | [Prompt 3](#prompt-3---אבטחה-בסיסית) |
| 4 | Build ובדיקה | Sonnet | [Prompt 4](#prompt-4---build-ובדיקה-מקומית) |
| 5 | הגדרת VPS | Sonnet | [Prompt 5](#prompt-5---הגדרת-vps) |
| 6 | פריסה | Sonnet | [Prompt 6](#prompt-6---פריסה-על-השרת) |
| 7 | SSL | Sonnet | [Prompt 7](#prompt-7---התקנת-ssl) |
| 8 | בדיקות סופיות | Sonnet | [Prompt 8](#prompt-8---בדיקות-סופיות) |

---

# שלב א' - הכרחי לפרודקשן

---

## Prompt 1 - בדיקות ותיקון באגים

```
אני עובד על פרויקט CRM-lite לניהול אנשי קשר ותרומות עבור מרכז נשמה.
הפרויקט נמצא ב: /home/user/CRM-lite/crm-app

## רקע על הפרויקט:
- אפליקציית React 18 + TypeScript + Vite
- Firebase Authentication (Google OAuth) + Firestore
- תמיכה ב-PWA ו-RTL (עברית)
- 6 קטגוריות אנשי קשר (מיובאים מאקסל)
- 7 סטטוסים לכל איש קשר

## המשימה שלך - בדיקת פונקציונליות:

### 1. הרץ את האפליקציה
```bash
cd /home/user/CRM-lite/crm-app
npm run dev
```

### 2. בדוק את הקונסול
- פתח את DevTools (F12) בדפדפן
- בדוק שאין שגיאות אדומות בטאב Console
- אם יש שגיאות - תקן אותן

### 3. בדוק את הפונקציונליות הבאה:
- [ ] מסך התחברות נטען (יש כפתור "מצב דמו" לבדיקה בלי Firebase אמיתי)
- [ ] לחיצה על "מצב דמו" מכניסה למערכת
- [ ] רשימת אנשי קשר נטענת
- [ ] הטאבים למעלה עובדים (סינון לפי קטגוריה)
- [ ] החיפוש עובד (חיפוש לפי שם או טלפון)
- [ ] לחיצה על כרטיס איש קשר פותחת מודל פרטים
- [ ] כפתור העריכה (עיפרון) פותח מודל עריכה
- [ ] כפתור הוספת הערה פותח מודל הערה
- [ ] כפתור ה-+ הצף (FAB) פותח מודל הוספת איש קשר חדש
- [ ] קישורי טלפון (אייקון טלפון) עובדים
- [ ] קישורי WhatsApp עובדים

### 4. תקן כל בעיה שתמצא
- אם משהו לא עובד - תקן את הקוד
- אם יש שגיאות TypeScript - תקן אותן
- אם יש warnings - נסה לתקן את החשובים

### 5. בסיום
- עשה commit עם הודעה ברורה על מה תיקנת
- push לענף: claude/contact-management-app-LYgK5
- תן לי סיכום של:
  - מה בדקת
  - אילו בעיות מצאת
  - מה תיקנת
  - מה עדיין לא עובד (אם יש)

## חשוב:
- אל תשנה פיצ'רים קיימים - רק תקן באגים
- אל תוסיף קוד חדש שלא נדרש
- שמור על המבנה הקיים
```

---

## Prompt 2 - השלמת CSS

```
אני ממשיך לעבוד על פרויקט CRM-lite.
הפרויקט נמצא ב: /home/user/CRM-lite/crm-app

## הבעיה:
הרבה מהקומפוננטות משתמשות ב-inline styles במקום CSS classes.
זה גורם לקוד להיות מבולגן וקשה לתחזוקה.

## המשימה שלך - השלמת CSS:

### 1. קרא את הקבצים הבאים:
- src/index.css (הסטיילים הקיימים)
- src/components/ContactDetailModal.tsx
- src/components/EditContactModal.tsx
- src/components/AddNoteModal.tsx
- src/components/StatusBadge.tsx
- src/pages/HomePage.tsx (כפתור FAB)

### 2. הוסף ל-index.css את הסטיילים החסרים:

#### מודלים (Modals):
```css
/* Modal Overlay - הרקע הכהה */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

/* Modal Content - התוכן */
.modal-content {
  background: white;
  border-radius: 1rem;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header {
  padding: 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.modal-close {
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  border-radius: 0.5rem;
  transition: background 0.2s;
}

.modal-close:hover {
  background: #f3f4f6;
}

.modal-body {
  padding: 1.25rem;
}

.modal-footer {
  padding: 1.25rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
```

#### כפתורים (Buttons):
```css
.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #1a5f7a;
  color: white;
}

.btn-primary:hover {
  background: #134a5f;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-success {
  background: #22c55e;
  color: white;
}

.btn-success:hover {
  background: #16a34a;
}

.btn-icon {
  padding: 0.5rem;
  background: none;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f3f4f6;
  color: #1a5f7a;
}

.btn-block {
  width: 100%;
}
```

#### טפסים (Forms):
```css
.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: white;
}

.form-input:focus {
  outline: none;
  border-color: #1a5f7a;
  box-shadow: 0 0 0 3px rgba(26, 95, 122, 0.1);
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
}

.form-textarea:focus {
  outline: none;
  border-color: #1a5f7a;
  box-shadow: 0 0 0 3px rgba(26, 95, 122, 0.1);
}

.form-select {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  background: white;
  cursor: pointer;
}

.form-error {
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
```

#### Badges (תגיות סטטוס):
```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-gray {
  background: #f3f4f6;
  color: #6b7280;
}

.badge-yellow {
  background: #fef3c7;
  color: #92400e;
}

.badge-blue {
  background: #dbeafe;
  color: #1e40af;
}

.badge-green {
  background: #dcfce7;
  color: #166534;
}

.badge-red {
  background: #fee2e2;
  color: #991b1b;
}

.badge-purple {
  background: #f3e8ff;
  color: #7c3aed;
}

.badge-orange {
  background: #ffedd5;
  color: #c2410c;
}
```

#### כפתור FAB (כפתור הוספה צף):
```css
.fab {
  position: fixed;
  bottom: 2rem;
  left: 2rem;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: #e07b39;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(224, 123, 57, 0.4);
  transition: all 0.2s;
  z-index: 100;
}

.fab:hover {
  background: #c96a2f;
  transform: scale(1.1);
}

.fab:active {
  transform: scale(0.95);
}
```

#### הערות (Notes):
```css
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.note-item {
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  border-right: 3px solid #1a5f7a;
}

.note-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.note-text {
  color: #1f2937;
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.note-original {
  border-right-color: #9ca3af;
  background: #f3f4f6;
}
```

#### Quick Status Buttons (כפתורי סטטוס מהיר):
```css
.quick-status-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.quick-status-btn {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-status-btn:hover {
  border-color: #1a5f7a;
  background: #f0f9ff;
}

.quick-status-btn.active {
  background: #1a5f7a;
  color: white;
  border-color: #1a5f7a;
}
```

### 3. עדכן את הקומפוננטות
לאחר הוספת ה-CSS, עבור על הקומפוננטות והחלף את ה-inline styles ב-className.

לדוגמה, במקום:
```tsx
<div style={{ padding: '1rem', background: 'white' }}>
```

תשתמש ב:
```tsx
<div className="modal-body">
```

### 4. בדוק שהכל עובד
- הרץ npm run dev
- בדוק שכל המודלים נראים טוב
- בדוק שהכפתורים עובדים
- בדוק שה-badges נראים נכון

### 5. בסיום
- commit ו-push לענף claude/contact-management-app-LYgK5
- סכם מה שינית

## צבעים לשמירה:
- Primary: #1a5f7a (כחול-ירקרק)
- Accent: #e07b39 (כתום)
- Success: #22c55e (ירוק)
- Danger: #ef4444 (אדום)
- Warning: #eab308 (צהוב)
```

---

## Prompt 3 - אבטחה בסיסית

```
אני ממשיך לעבוד על פרויקט CRM-lite.
הפרויקט נמצא ב: /home/user/CRM-lite/crm-app

## המשימה - אבטחה בסיסית:

### 1. צור קובץ Firebase Security Rules
צור קובץ חדש: /home/user/CRM-lite/crm-app/firestore.rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // פונקציה לבדיקת משתמש מחובר
    function isAuthenticated() {
      return request.auth != null;
    }

    // פונקציה לבדיקת משתמש מורשה (אופציונלי - לשימוש עתידי)
    function isAuthorizedUser() {
      return isAuthenticated() &&
        request.auth.token.email in [
          'mail1@gmail.com',
          'mail2@gmail.com',
          'mail3@gmail.com'
        ];
    }

    // אנשי קשר - רק משתמשים מחוברים
    match /contacts/{contactId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAuthenticated();
      allow delete: if isAuthenticated();
    }

    // משתמשים - כל אחד יכול לקרוא/לכתוב רק את עצמו
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // הגדרות - רק קריאה למשתמשים מחוברים
    match /settings/{document} {
      allow read: if isAuthenticated();
      allow write: if false; // רק דרך Admin SDK
    }
  }
}
```

### 2. בדוק את קובץ firebase.ts
קרא את הקובץ src/services/firebase.ts ובדוק:
- האם רשימת המיילים המורשים מוגדרת נכון?
- האם יש מידע רגיש שלא צריך להיות בקוד?

### 3. בדוק את .gitignore
וודא שהקבצים הבאים נמצאים ב-.gitignore:
- .env
- .env.local
- .env.*.local
- node_modules/
- dist/
- *.log

### 4. בדוק שאין מידע רגיש
חפש בקוד:
- סיסמאות
- API keys שלא צריכים להיות בקוד (Firebase keys ב-.env זה בסדר)
- tokens
- credentials

### 5. עדכן את ה-.env.example
צור קובץ .env.example (בלי הערכים האמיתיים) לדוגמה:
```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 6. בסיום
- commit ו-push
- סכם מה בדקת ומה שינית
```

---

## Prompt 4 - Build ובדיקה מקומית

```
אני ממשיך לעבוד על פרויקט CRM-lite.
הפרויקט נמצא ב: /home/user/CRM-lite/crm-app

## המשימה - בניית האפליקציה לפרודקשן:

### 1. בדוק את הגדרות Vite
קרא את vite.config.ts ווודא:
- base: '/' (או הנתיב הנכון)
- build.outDir: 'dist'
- שה-PWA plugin מוגדר נכון

### 2. בדוק TypeScript
הרץ בדיקת types:
```bash
cd /home/user/CRM-lite/crm-app
npx tsc --noEmit
```
תקן כל שגיאה שתופיע.

### 3. בנה את האפליקציה
```bash
npm run build
```
וודא שהבנייה מסתיימת בהצלחה ללא שגיאות.

### 4. בדוק את הבנייה מקומית
```bash
npm run preview
```
פתח את הדפדפן ב-http://localhost:4173 ובדוק:
- [ ] האתר נטען
- [ ] ההתחברות עובדת
- [ ] הרשימה נטענת
- [ ] המודלים עובדים
- [ ] אין שגיאות בקונסול

### 5. בדוק את גודל ה-bundle
הסתכל על הפלט של npm run build:
- האם הגודל סביר? (צריך להיות פחות מ-500KB gzipped)
- האם יש אזהרות על קבצים גדולים מדי?

### 6. בדוק את תיקיית dist
וודא שנוצרו:
- dist/index.html
- dist/assets/ (קבצי JS ו-CSS)
- dist/manifest.webmanifest (ל-PWA)

### 7. בסיום
- commit ו-push
- דווח על:
  - האם הבנייה הצליחה?
  - מה גודל ה-bundle?
  - האם הכל עובד ב-preview?
```

---

## Prompt 5 - הגדרת VPS

```
אני מכין הוראות להגדרת שרת Hostinger VPS עבור פרויקט CRM-lite.

## פרטי השרת (להשלמה):
- IP: _______________
- דומיין: _______________
- משתמש SSH: _______________
- מערכת הפעלה: Ubuntu 22.04 (או גרסה אחרת)

## צור לי סקריפט התקנה מלא:

### 1. סקריפט התקנה ראשונית
צור קובץ: /home/user/CRM-lite/scripts/vps-setup.sh

```bash
#!/bin/bash

# ===========================================
# סקריפט התקנה - CRM Lite על Hostinger VPS
# ===========================================

echo "🚀 מתחיל התקנה..."

# עדכון המערכת
echo "📦 מעדכן את המערכת..."
sudo apt update && sudo apt upgrade -y

# התקנת Nginx
echo "🌐 מתקין Nginx..."
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx

# התקנת Node.js 20
echo "📗 מתקין Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# בדיקת גרסאות
echo "📋 בודק גרסאות..."
node --version
npm --version
nginx -v

# התקנת Git
echo "📚 מתקין Git..."
sudo apt install git -y

# התקנת Certbot (SSL)
echo "🔒 מתקין Certbot..."
sudo apt install certbot python3-certbot-nginx -y

# הגדרת Firewall
echo "🛡️ מגדיר Firewall..."
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# יצירת תיקיית האתר
echo "📁 יוצר תיקיות..."
sudo mkdir -p /var/www/crm-lite
sudo chown $USER:$USER /var/www/crm-lite

echo "✅ ההתקנה הושלמה!"
echo ""
echo "השלבים הבאים:"
echo "1. העלה את קבצי האתר ל-/var/www/crm-lite"
echo "2. הגדר את Nginx"
echo "3. התקן SSL"
```

### 2. קובץ קונפיגורציה של Nginx
צור קובץ: /home/user/CRM-lite/scripts/nginx-config.conf

```nginx
# Nginx Configuration for CRM Lite
# Copy to: /etc/nginx/sites-available/crm-lite

server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    # Redirect to HTTPS (after SSL is installed)
    # return 301 https://$server_name$request_uri;

    root /var/www/crm-lite;
    index index.html;

    # SPA routing - all paths go to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Hide Nginx version
    server_tokens off;
}
```

### 3. סקריפט פריסה
צור קובץ: /home/user/CRM-lite/scripts/deploy.sh

```bash
#!/bin/bash

# ===========================================
# סקריפט פריסה - CRM Lite
# ===========================================

DOMAIN="YOUR_DOMAIN.com"
SITE_DIR="/var/www/crm-lite"

echo "🚀 מתחיל פריסה..."

# הגדרת Nginx
echo "🌐 מגדיר Nginx..."
sudo cp /home/user/CRM-lite/scripts/nginx-config.conf /etc/nginx/sites-available/crm-lite
sudo sed -i "s/YOUR_DOMAIN.com/$DOMAIN/g" /etc/nginx/sites-available/crm-lite
sudo ln -sf /etc/nginx/sites-available/crm-lite /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# בדיקת Nginx
echo "🔍 בודק קונפיגורציה..."
sudo nginx -t

# הפעלה מחדש
echo "🔄 מפעיל מחדש..."
sudo systemctl restart nginx

echo "✅ הפריסה הושלמה!"
echo ""
echo "האתר זמין ב: http://$DOMAIN"
echo ""
echo "להתקנת SSL הרץ:"
echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
```

### 4. הוראות שימוש
צור קובץ: /home/user/CRM-lite/scripts/VPS_INSTRUCTIONS.md

עם הוראות מפורטות צעד אחר צעד.

### 5. בסיום
- commit ו-push
- וודא שכל הסקריפטים קריאים ומובנים
```

---

## Prompt 6 - פריסה על השרת

```
אני מעלה את פרויקט CRM-lite לשרת VPS.

## פרטי השרת:
- IP: _______________
- דומיין: _______________
- משתמש SSH: _______________

## המשימה - העלאה ופריסה:

### 1. בנה את האפליקציה (אם עוד לא)
```bash
cd /home/user/CRM-lite/crm-app
npm run build
```

### 2. צור קובץ ZIP להעלאה
```bash
cd /home/user/CRM-lite/crm-app
zip -r dist.zip dist/
```

### 3. תן לי את פקודות ההעלאה
```bash
# העלאה עם SCP
scp dist.zip user@server:/var/www/crm-lite/

# או עם rsync (מהיר יותר לעדכונים)
rsync -avz --delete dist/ user@server:/var/www/crm-lite/
```

### 4. פקודות לשרת
מה להריץ בשרת אחרי ההעלאה:
```bash
cd /var/www/crm-lite
unzip -o dist.zip
mv dist/* .
rm -rf dist dist.zip
```

### 5. הפעלת Nginx
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 6. בדיקה
- פתח את האתר בדפדפן
- בדוק שההתחברות עובדת
- בדוק שהאפליקציה עובדת

### 7. בעיות נפוצות ופתרונות
אם משהו לא עובד, תן לי פתרונות לבעיות כמו:
- 404 errors
- 502 Bad Gateway
- בעיות CORS
- בעיות Firebase Auth
```

---

## Prompt 7 - התקנת SSL

```
אני מתקין SSL לאתר CRM-lite על VPS.

## פרטי השרת:
- דומיין: _______________
- שרת: Hostinger VPS עם Ubuntu ו-Nginx

## המשימה - התקנת SSL:

### 1. בדוק ש-Certbot מותקן
```bash
certbot --version
```
אם לא מותקן:
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 2. התקן SSL
```bash
sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

### 3. בדוק חידוש אוטומטי
```bash
sudo certbot renew --dry-run
```

### 4. עדכן את Nginx
וודא שהקונפיגורציה מפנה ל-HTTPS:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/crm-lite;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 5. הפעל מחדש
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 6. בדוק
- פתח https://YOUR_DOMAIN.com
- וודא שיש מנעול ירוק
- וודא שאין mixed content warnings
```

---

## Prompt 8 - בדיקות סופיות

```
אני מבצע בדיקות סופיות לאתר CRM-lite לפני שחרור.

## פרטי האתר:
- כתובת: https://_______________

## המשימה - צ'קליסט בדיקות:

### 1. בדיקות בסיסיות
- [ ] האתר נטען ב-HTTPS
- [ ] יש מנעול ירוק
- [ ] אין שגיאות בקונסול

### 2. בדיקות התחברות
- [ ] מסך Login נטען
- [ ] כפתור Google OAuth עובד
- [ ] המשתמש מחובר ורואה את שמו

### 3. בדיקות פונקציונליות
- [ ] רשימת אנשי קשר נטענת
- [ ] סינון לפי קטגוריה עובד
- [ ] חיפוש עובד
- [ ] צפייה בפרטי איש קשר עובדת
- [ ] עריכת איש קשר עובדת
- [ ] הוספת איש קשר חדש עובדת
- [ ] הוספת הערה עובדת
- [ ] שינוי סטטוס עובד
- [ ] קישור לטלפון עובד
- [ ] קישור ל-WhatsApp עובד

### 4. בדיקות מובייל
- [ ] האתר נראה טוב במובייל
- [ ] הכפתורים עובדים במגע
- [ ] המודלים נפתחים ונסגרים
- [ ] הגלילה עובדת

### 5. בדיקות PWA
- [ ] ניתן להתקין את האפליקציה
- [ ] האייקון נראה נכון
- [ ] האפליקציה עובדת offline (בסיסי)

### 6. בדיקות Firebase
- [ ] הנתונים נשמרים ב-Firestore
- [ ] עדכונים מופיעים בזמן אמת
- [ ] הדומיין מורשה ב-Firebase Console
  - Authentication → Settings → Authorized domains

### 7. בדיקות ביצועים
הרץ את האתר ב-Lighthouse:
- [ ] Performance > 80
- [ ] Accessibility > 90
- [ ] Best Practices > 90
- [ ] SEO > 80

### 8. סיכום
תן לי דוח על:
- מה עובד
- מה לא עובד
- מה צריך לתקן
- האם האתר מוכן לשימוש?
```

---

# שלב ב' - שיפורים (אחרי פרודקשן)

---

## Prompt B1 - דשבורד וסטטיסטיקות

```
אני רוצה להוסיף מסך דשבורד לפרויקט CRM-lite.

## מיקום הפרויקט: /home/user/CRM-lite/crm-app

## הדרישות:

### 1. צור קומפוננטה חדשה
קובץ: src/components/Dashboard.tsx

### 2. הצג את הסטטיסטיקות הבאות:
- סה"כ אנשי קשר
- לפי סטטוס:
  - לא נבדק
  - לא ענה
  - להתקשר שוב
  - בתהליך
  - סירב
  - תרם
  - לעקוב
- לפי קטגוריה (6 הגיליונות)

### 3. הצג גרפים פשוטים
- עוגה לפי סטטוס
- עמודות לפי קטגוריה

### 4. הוסף טאב Dashboard
ב-HomePage.tsx הוסף טאב נוסף שמציג את הדשבורד

### 5. עיצוב
- כרטיסים עם מספרים גדולים
- צבעים לפי סטטוס
- רספונסיבי למובייל

### 6. בסיום
- commit ו-push
- הראה לי screenshot או תאר איך זה נראה
```

---

## Prompt B2 - ניהול תרומות

```
אני רוצה להוסיף מסך ניהול תרומות לפרויקט CRM-lite.

## מיקום הפרויקט: /home/user/CRM-lite/crm-app

## הדרישות:

### 1. הצג רשימת תורמים
- רק אנשי קשר עם סטטוס "תרם"
- סינון לפי טווח תאריכים
- מיון לפי סכום

### 2. פרטי תרומה לכל איש קשר
הוסף לממשק:
- סוג תרומה (חד פעמית / חודשית)
- סכום תרומה חודשית
- סה"כ תרומות
- היסטוריית תרומות

### 3. סיכומים
- סה"כ תורמים
- סה"כ תרומות החודש
- סה"כ תרומות השנה
- ממוצע תרומה

### 4. עיצוב
- טבלה מסודרת
- סינונים בראש הדף
- כפתור ייצוא

### 5. בסיום
- commit ו-push
```

---

## Prompt B3 - ייצוא דוחות

```
אני רוצה להוסיף יכולת ייצוא דוחות לפרויקט CRM-lite.

## מיקום הפרויקט: /home/user/CRM-lite/crm-app

## הדרישות:

### 1. ייצוא לאקסל
- כפתור "ייצוא לאקסל" במסך הראשי
- ייצוא כל אנשי הקשר או לפי סינון נוכחי
- עמודות: שם, טלפון, מייל, עיר, סטטוס, קטגוריה, הערות

### 2. ייצוא PDF (אופציונלי)
- דוח מסכם
- לוגו בראש הדף
- תאריך הפקה

### 3. שימוש בספריות
- xlsx (כבר מותקנת)
- אופציונלי: jspdf או react-pdf

### 4. בסיום
- commit ו-push
```

---

## Prompt B4 - הקצאת אנשי קשר

```
אני רוצה להוסיף יכולת הקצאת אנשי קשר למשתמשים בפרויקט CRM-lite.

## מיקום הפרויקט: /home/user/CRM-lite/crm-app

## הדרישות:

### 1. הקצאת איש קשר
- בעריכת איש קשר: dropdown לבחירת משתמש אחראי
- שדה assignedTo כבר קיים ב-Contact

### 2. סינון "האנשים שלי"
- טאב או פילטר להצגת רק אנשי הקשר המוקצים למשתמש הנוכחי

### 3. רשימת משתמשים
- שליפת רשימת המשתמשים מ-Firestore
- או רשימה סטטית של 3 המשתמשים

### 4. בסיום
- commit ו-push
```

---

# 📝 הוראות שימוש כלליות

## התחלת שיחה חדשה
בכל שיחה חדשה עם Claude, התחל עם:
```
אני עובד על פרויקט CRM-lite בנתיב /home/user/CRM-lite/crm-app
הענף: claude/contact-management-app-LYgK5
```

## סיום שיחה
בקש תמיד:
```
עשה commit ו-push לכל השינויים
```

## בעיות?
```
יש לי בעיה: [תאר את הבעיה]
תראה לי את השגיאה ותציע פתרון
```

---

*מסמך זה נוצר: 2025-12-21*
