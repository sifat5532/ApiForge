const fs = require('fs');
const path = 'D:/Academic/ApiForge/frontend/public/js/projects.js';
let content = fs.readFileSync(path, 'utf8');

// We just need to add createdAt, createdTimestamp, updatedTimestamp to each object.
// We can use a simple regex to add it before authEnabled or updatedAt

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

function generateTimestamps(updatedStr) {
    let offset = 0;
    if (updatedStr.includes('hour')) offset = 2 * 60 * 60 * 1000;
    else if (updatedStr.includes('Yesterday')) offset = 1 * day;
    else if (updatedStr.includes('3 days')) offset = 3 * day;
    else if (updatedStr.includes('4 days')) offset = 4 * day;
    else if (updatedStr.includes('5 days')) offset = 5 * day;
    else if (updatedStr.includes('1 week')) offset = 7 * day;
    else if (updatedStr.includes('2 weeks')) offset = 14 * day;
    else if (updatedStr.includes('3 weeks')) offset = 21 * day;
    else if (updatedStr.includes('1 month')) offset = 30 * day;
    else offset = 3 * 60 * 60 * 1000;
    
    const updatedTimestamp = now - offset;
    const createdTimestamp = updatedTimestamp - (30 * day); // Created 30 days before update
    const createdDate = new Date(createdTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    
    return {
        updatedTimestamp,
        createdTimestamp,
        createdAt: createdDate
    };
}

let newContent = content.replace(/updatedAt:\s*'([^']+)',/g, (match, p1) => {
    const { updatedTimestamp, createdTimestamp, createdAt } = generateTimestamps(p1);
    return `updatedAt: '${p1}',\n    updatedTimestamp: ${updatedTimestamp},\n    createdTimestamp: ${createdTimestamp},\n    createdAt: '${createdAt}',`;
});

// Now we need to update state to include sortOption
newContent = newContent.replace(
    /searchQuery:\s*'',/,
    `searchQuery: '',\n  sortOption: 'updated-desc',`
);

fs.writeFileSync(path, newContent);
console.log('Successfully updated projects.js');
