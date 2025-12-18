const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

console.log('Loading service account...');
const serviceAccount = require('./serviceAccountKey.json');
console.log('Project ID:', serviceAccount.project_id);

console.log('Initializing Firebase Admin...');
initializeApp({
    credential: cert(serviceAccount)
});

console.log('Getting Firestore...');
const db = getFirestore();

console.log('Testing connection...');
db.collection('test').doc('ping').set({ timestamp: new Date() })
    .then(() => {
        console.log('✅ Firestore connection successful!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
