const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'transactions.json');

try {
    // Read the file content
    let content = fs.readFileSync(filePath, 'utf8');

    console.log('Original file size:', content.length);

    // Fix the extra spaces after colons
    // Replace ":  " with ": " (multiple spaces to single space)
    content = content.replace(/:\s\s+/g, ': ');

    console.log('Fixed file size:', content.length);

    // Verify it's valid JSON
    const data = JSON.parse(content);
    console.log('✅ Valid JSON! Contains', data.length, 'transactions');

    // Write back properly formatted JSON
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log('✅ File fixed and reformatted!');
} catch (error) {
    console.error('❌ Error:', error.message);
}