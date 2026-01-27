const fs = require('fs');
const content = fs.readFileSync('cities.js', 'utf8');
const levels = { 1: 0, 2: 0, 3: 0 };
const regex = /"level":\s*(\d)/g;
let match;
while ((match = regex.exec(content)) !== null) {
    levels[match[1]]++;
}
console.log(JSON.stringify(levels));
