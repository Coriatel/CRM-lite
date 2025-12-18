/**
 * Excel to Firestore Import Script - Import ALL contacts
 * Including those with missing phone numbers or other details
 */

const XLSX = require('xlsx');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const path = require('path');

console.log('Starting import (including contacts with missing data)...');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
console.log('Project:', serviceAccount.project_id);

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
console.log('Firebase initialized');

// Sheet name mapping
const SHEET_MAPPING = {
    'אנשי קשר': 'אנשי_קשר',
    'תורמים פוטנציאליים': 'תורמים_פוטנציאליים',
    'תורמים שתרמו': 'תורמים_שתרמו',
    'חברים טובים': 'חברים_טובים',
    'תלמידים': 'תלמידים',
    'אנשים שאפשר להתקשר להתרמות': 'להתרמות'
};

// Column mapping for each sheet - trying multiple columns for name
const COLUMN_MAPPINGS = {
    'אנשי קשר': { nameColumns: [1], category: 0, phone1: 2, phone2: 3, email: 5, address: 6, originalNote: 7 },
    'תורמים פוטנציאליים': { nameColumns: [0], phone1: 1, city: 2, address: 3, email: 4, originalNote: 5, monthlyDonation: 6, totalDonation: 7 },
    'תורמים שתרמו': { nameColumns: [0], donationType: 1, originalNote: 2 },
    'חברים טובים': { nameColumns: [0], originalNote: 1 },
    'תלמידים': { nameColumns: [1], category: 0, phone1: 2, address: 3, email: 4, originalNote: 6 },
    'אנשים שאפשר להתקשר להתרמות': { nameColumns: [0, 1], phone1: 2, address: 3, email: 4, originalNote: 5 }
};

function getStringValue(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
}

function findName(row, nameColumns) {
    for (const col of nameColumns) {
        const name = getStringValue(row[col]);
        if (name && name.length > 1) return name;
    }
    return null;
}

async function importExcel() {
    const excelPath = path.resolve(__dirname, '..', '..', 'אנשי קשר ותורמים.xlsx');
    console.log('Reading:', excelPath);

    const workbook = XLSX.readFile(excelPath);
    console.log('Sheets:', workbook.SheetNames);

    // First, delete all existing contacts to avoid duplicates
    console.log('\nClearing existing contacts...');
    const existingDocs = await db.collection('contacts').listDocuments();
    const deletePromises = existingDocs.map(doc => doc.delete());
    await Promise.all(deletePromises);
    console.log(`Deleted ${existingDocs.length} existing contacts`);

    let totalImported = 0;
    let totalSkipped = 0;
    const contactsRef = db.collection('contacts');

    for (const sheetName of workbook.SheetNames) {
        const sourceKey = SHEET_MAPPING[sheetName];
        if (!sourceKey) {
            console.log(`Skipping unknown sheet: ${sheetName}`);
            continue;
        }

        const columnMap = COLUMN_MAPPINGS[sheetName];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log(`\nProcessing: ${sheetName} (${data.length - 1} rows)`);

        let sheetImported = 0;
        let sheetSkipped = 0;
        let batch = db.batch();
        let batchCount = 0;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) {
                sheetSkipped++;
                continue;
            }

            // Try to find a name
            const fullName = findName(row, columnMap.nameColumns);

            // Skip only if completely empty row or no identifiable data at all
            if (!fullName) {
                // Check if there's ANY useful data in the row
                const hasAnyData = row.some(cell => getStringValue(cell) !== null);
                if (!hasAnyData) {
                    sheetSkipped++;
                    continue;
                }

                // Log rows that have data but no name
                console.log(`    Skipping row ${i + 1}: Data exists but no name found`);
                sheetSkipped++;
                continue;
            }

            // Log if we are importing a contact without a phone number
            const phone1 = columnMap.phone1 !== undefined ? getStringValue(row[columnMap.phone1]) : null;
            if (!phone1 && !row[columnMap.phone2]) {
                console.log(`    Importing: ${fullName} (No phone number)`);
            }

            const contact = {
                source: sourceKey,
                fullName: fullName || `ללא שם (שורה ${i + 1})`,
                status: 'not_checked',
                notes: [],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            // Add all optional fields - even if undefined
            if (columnMap.category !== undefined) {
                const val = getStringValue(row[columnMap.category]);
                if (val) contact.category = val;
            }
            if (columnMap.phone1 !== undefined) {
                const val = getStringValue(row[columnMap.phone1]);
                if (val) contact.phone1 = val;
            }
            if (columnMap.phone2 !== undefined) {
                const val = getStringValue(row[columnMap.phone2]);
                if (val) contact.phone2 = val;
            }
            if (columnMap.email !== undefined) {
                const val = getStringValue(row[columnMap.email]);
                if (val) contact.email = val;
            }
            if (columnMap.city !== undefined) {
                const val = getStringValue(row[columnMap.city]);
                if (val) contact.city = val;
            }
            if (columnMap.address !== undefined) {
                const val = getStringValue(row[columnMap.address]);
                if (val) contact.address = val;
            }
            if (columnMap.originalNote !== undefined) {
                const val = getStringValue(row[columnMap.originalNote]);
                if (val) contact.originalNote = val;
            }
            if (columnMap.donationType !== undefined) {
                const val = getStringValue(row[columnMap.donationType]);
                if (val) contact.donationType = val;
            }
            if (columnMap.monthlyDonation !== undefined) {
                const num = parseFloat(row[columnMap.monthlyDonation]);
                if (!isNaN(num)) contact.monthlyDonation = num;
            }
            if (columnMap.totalDonation !== undefined) {
                const num = parseFloat(row[columnMap.totalDonation]);
                if (!isNaN(num)) contact.totalDonation = num;
            }

            const docRef = contactsRef.doc();
            batch.set(docRef, contact);
            batchCount++;
            sheetImported++;

            // Commit every 400 to stay under Firestore limit
            if (batchCount >= 400) {
                await batch.commit();
                console.log(`  Committed batch of ${batchCount}...`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        // Commit remaining
        if (batchCount > 0) {
            await batch.commit();
        }

        totalImported += sheetImported;
        totalSkipped += sheetSkipped;
        console.log(`  ✓ Imported ${sheetImported}, skipped ${sheetSkipped} empty rows`);
    }

    console.log(`\n✅ Total imported: ${totalImported} contacts`);
    console.log(`   Skipped: ${totalSkipped} empty rows`);
}

importExcel()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
