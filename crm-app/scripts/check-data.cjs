const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkData() {
    console.log('Checking Firestore data...');
    const snapshot = await db.collection('contacts').count().get();
    console.log(`Total contacts found: ${snapshot.data().count}`);

    if (snapshot.data().count > 0) {
        const sample = await db.collection('contacts').limit(1).get();
        console.log('Sample contact:', sample.docs[0].data());
    }
}

checkData().catch(console.error);
