const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (file.endsWith('.css')) {
            results.push(fullPath);
        }
    });
    return results;
}

const cssFiles = walk('E:\\KH3 WELLNESS\\src');
cssFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('color: rgba(255,255,255,0.05)')) {
        console.log(`Fixing ${file}`);
        content = content.replace(/color: rgba\(255,\s*255,\s*255,\s*0\.05\)/g, 'color: #ffffff');
        fs.writeFileSync(file, content);
    }
});
