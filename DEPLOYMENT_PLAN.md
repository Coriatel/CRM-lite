# תוכנית פריסה - CRM Lite נשמה
## מ-Development ל-Production

---

# 🎯 שלב א' - הכרחי לפרודקשן (MVP)

## 1. תיקוני באגים ובדיקות בסיסיות

### 1.1 בדיקת פונקציונליות קיימת
- [ ] בדיקת התחברות Google OAuth
- [ ] בדיקת טעינת אנשי קשר
- [ ] בדיקת חיפוש וסינון
- [ ] בדיקת הוספה/עריכת איש קשר
- [ ] בדיקת הוספת הערות
- [ ] בדיקת עדכון סטטוס
- [ ] בדיקת קישורי טלפון ו-WhatsApp

### 1.2 תיקון שגיאות קונסול
```bash
# הרצת האפליקציה ובדיקת Console ב-DevTools
npm run dev
# לתקן כל שגיאה אדומה שמופיעה
```

---

## 2. השלמת עיצוב CSS קריטי

### 2.1 מודלים (Modals)
**קובץ:** `src/index.css`
```css
/* להוסיף עיצוב למודלים */
.modal-overlay { ... }
.modal-content { ... }
.modal-header { ... }
.modal-body { ... }
.modal-footer { ... }
```

### 2.2 כפתורים
```css
.btn { ... }
.btn-primary { ... }
.btn-secondary { ... }
.btn-danger { ... }
.btn-icon { ... }
```

### 2.3 טפסים
```css
.form-group { ... }
.form-label { ... }
.form-input { ... }
.form-textarea { ... }
```

### 2.4 Badges
```css
.badge { ... }
.badge-success { ... }
.badge-warning { ... }
.badge-danger { ... }
```

### 2.5 FAB Button (כפתור הוספה צף)
```css
.fab { ... }
```

---

## 3. אבטחה בסיסית

### 3.1 Firebase Security Rules
**קובץ חדש:** `firestore.rules`
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // רק משתמשים מחוברים יכולים לקרוא/לכתוב
    match /contacts/{contactId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3.2 הסרת מידע רגיש מקוד
- [ ] וידוא שאין סיסמאות בקוד
- [ ] וידוא ש-.env לא נמצא ב-git (כבר ב-.gitignore)

### 3.3 רשימת משתמשים מורשים
**קובץ:** `src/services/firebase.ts`
- [ ] להעביר את רשימת המיילים המורשים ל-Firestore או environment variable

---

## 4. הכנה לבנייה (Build)

### 4.1 עדכון הגדרות
**קובץ:** `vite.config.ts`
```typescript
export default defineConfig({
  base: '/', // או נתיב אחר אם לא ב-root
  build: {
    outDir: 'dist',
    sourcemap: false, // לפרודקשן
  }
})
```

### 4.2 בנייה ובדיקה מקומית
```bash
cd crm-app
npm run build
npm run preview
# לבדוק שהכל עובד ב-http://localhost:4173
```

---

## 5. הגדרת שרת Hostinger VPS

### 5.1 התחברות לשרת
```bash
ssh user@your-server-ip
```

### 5.2 התקנת תוכנות נדרשות
```bash
# עדכון המערכת
sudo apt update && sudo apt upgrade -y

# התקנת Nginx
sudo apt install nginx -y

# התקנת Node.js (לבניית האפליקציה בשרת)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# התקנת Git
sudo apt install git -y
```

### 5.3 הגדרת Firewall
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 6. העלאה ופריסה

### 6.1 העלאת הקוד לשרת
```bash
# בשרת - יצירת תיקייה
sudo mkdir -p /var/www/crm-lite
sudo chown $USER:$USER /var/www/crm-lite

# שליפת הקוד מ-GitHub
cd /var/www/crm-lite
git clone https://github.com/YOUR_REPO/CRM-lite.git .

# או העלאה ישירה עם scp
scp -r ./crm-app/dist/* user@server:/var/www/crm-lite/
```

### 6.2 הגדרת Nginx
**קובץ:** `/etc/nginx/sites-available/crm-lite`
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/crm-lite;
    index index.html;

    # SPA routing - כל הנתיבים מפנים ל-index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache לקבצים סטטיים
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
```

### 6.3 הפעלת האתר
```bash
# הפעלת הקונפיגורציה
sudo ln -s /etc/nginx/sites-available/crm-lite /etc/nginx/sites-enabled/
sudo nginx -t  # בדיקת תקינות
sudo systemctl restart nginx
```

---

## 7. SSL (HTTPS)

### 7.1 התקנת Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 7.2 יצירת תעודת SSL
```bash
sudo certbot --nginx -d your-domain.com
```

### 7.3 חידוש אוטומטי
```bash
# בדיקה שהחידוש האוטומטי עובד
sudo certbot renew --dry-run
```

---

## 8. בדיקות סופיות לפני שחרור

### 8.1 צ'קליסט
- [ ] האתר עולה ב-HTTPS
- [ ] התחברות Google עובדת
- [ ] אנשי קשר נטענים
- [ ] ניתן להוסיף/לערוך אנשי קשר
- [ ] ניתן להוסיף הערות
- [ ] האפליקציה עובדת במובייל
- [ ] ניתן להתקין כ-PWA

### 8.2 עדכון Firebase
- [ ] להוסיף את הדומיין החדש ל-Firebase Console
  - Authentication → Settings → Authorized domains

---

# 🚀 שלב ב' - שיפורים ותוספות (אחרי פרודקשן)

## 1. דשבורד וסטטיסטיקות
- [ ] מסך סיכום עם:
  - סה"כ אנשי קשר
  - לפי סטטוס (כמה תרמו, כמה סירבו, וכו')
  - גרפים של התקדמות

## 2. ניהול תרומות
- [ ] מסך ייעודי לתרומות
- [ ] סיכום סכומים
- [ ] היסטוריית תרומות לכל איש קשר

## 3. הקצאת אנשי קשר
- [ ] יכולת להקצות איש קשר למשתמש ספציפי
- [ ] סינון "האנשים שלי"

## 4. ייצוא דוחות
- [ ] ייצוא לאקסל
- [ ] ייצוא ל-PDF

## 5. תזכורות
- [ ] תזכורת "להתקשר שוב"
- [ ] התראות push

## 6. פעולות מרובות (Bulk)
- [ ] בחירת כמה אנשי קשר
- [ ] עדכון סטטוס מרובה
- [ ] מחיקה מרובה

## 7. גיבוי אוטומטי
- [ ] גיבוי יומי של Firestore
- [ ] ייצוא אוטומטי

---

# 📋 סיכום - סדר עדיפויות

| שלב | משימה | זמן משוער | סטטוס |
|-----|--------|-----------|-------|
| א.1 | בדיקת פונקציונליות | 1-2 שעות | ⏳ |
| א.2 | השלמת CSS | 2-3 שעות | ⏳ |
| א.3 | אבטחה בסיסית | 30 דקות | ⏳ |
| א.4 | Build ובדיקה | 30 דקות | ⏳ |
| א.5 | הגדרת VPS | 1 שעה | ⏳ |
| א.6 | פריסה | 30 דקות | ⏳ |
| א.7 | SSL | 15 דקות | ⏳ |
| א.8 | בדיקות סופיות | 30 דקות | ⏳ |
| **סה"כ שלב א'** | | **~7 שעות** | |

---

# 🔧 פקודות מהירות

## בפיתוח (מקומי)
```bash
cd /home/user/CRM-lite/crm-app
npm run dev          # הרצה לפיתוח
npm run build        # בנייה לפרודקשן
npm run preview      # בדיקת הבנייה
```

## בשרת
```bash
# עדכון האתר
cd /var/www/crm-lite
git pull
npm run build
sudo systemctl restart nginx

# בדיקת לוגים
sudo tail -f /var/log/nginx/error.log
```

---

# ⚠️ דגשים חשובים

1. **לפני כל שינוי** - לעשות commit ו-push
2. **Firebase domains** - לזכור להוסיף את הדומיין החדש
3. **גיבוי** - לפני פריסה לעשות גיבוי של Firestore
4. **בדיקה במובייל** - האפליקציה מיועדת בעיקר למובייל

---

*עודכן: 2025-12-21*
