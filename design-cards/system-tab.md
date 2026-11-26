# Design Card — מרחב הניהול: לשונית "מערכת" (בעלים בלבד)

skill: ui-design-thinking
date: 2026-11-26
screens: ~/work/system-map/mockup/built-shots/s3-*.png, s4-*.png (slices S3, S4), approved mockup ~/work/system-map/mockup/v4d (+ "קומות" from v4d-3d, flat)

1. What is this surface? A focus / status picture of the whole system for the owner, plus a tool for drilling into the map. It is not navigation and not settings. It appears in the nav only for the owner, because the server answers him alone.
2. The one thing seen first: whatever does not work right now. The count "לא עובד עכשיו" is the first row, then "עובד, צריך טיפול", then "תחזוקה". Something that works is never called "מושבת" (owner 26.11).
3. Info vs action: in S3 there are counts in plain text rows, with no buttons or chips. The only actions are the nav item itself and "ניסיון נוסף" on a load error. Later slices add rows that open an item; those are links that say where they go.
4. Groups by meaning: one panel, "מצב עכשיו", holds the three words + "עובדים מתוך". The data date sits under the screen title, in the same place as "תורמים" ("נתונים עד …").
5. Repeated structure: screen title → white panel with a heading → rows with hairlines, the same as היום / תורמים (mgmt-area.md). Nothing extra: no metric cards, no icons per row.
6. Borrowed pattern: this area's own panel pattern (mgmt-area.md) and the approved mockup v4d. Later status lists follow Google's status-dashboard pattern (a word plus colour, never colour alone).
7. Direction / time: RTL. Numbers are isolated (`<bdi>`). The data age uses the area's existing freshness words; once the data is older than the stale limit it says so in words.
8. Typography: Heebo only; the area's three sizes (screen title, panel heading, body). No letter-spacing.

RULES.md check (on s3-360 / s3-1280):
1. Save space: PASS. One panel, no empty hero.
2. Related things adjacent: PASS. The three words sit together, and the date sits under the title.
3. Big clear headings tight to their card: PASS. "מערכת" and "מצב עכשיו".
4. Minimal, full-width cards: PASS.
5. A group = one card with hairlines: PASS.
6. No text overflow, clear buttons: PASS at 360. The tab bar now fits 5 items in one row; before the fix the 5th wrapped to a second row.
7. The answer first: PASS. "לא עובד עכשיו" is the first row.
8. Keep the product's own look: PASS. House panel, cream paper, blue-deep active tab.

Blurry-eyes check (s3-360): a white panel with four short rows under a big "מערכת"; the first row is the problem count. The fifth tab item "מערכת" is visibly active.
