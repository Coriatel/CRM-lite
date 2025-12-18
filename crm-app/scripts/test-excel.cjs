/**
 * Simple Excel Test
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelPath = path.resolve(__dirname, '..', '..', 'אנשי קשר ותורמים.xlsx');
console.log('Path:', excelPath);
console.log('Exists:', fs.existsSync(excelPath));

if (fs.existsSync(excelPath)) {
    const workbook = XLSX.readFile(excelPath);
    console.log('Sheets:', workbook.SheetNames);

    workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`${name}: ${data.length} rows`);
    });
}
