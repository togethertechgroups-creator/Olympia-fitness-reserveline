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
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  // Replace standard strokeWidth
  content = content.replace(/strokeWidth="2"/g, 'strokeWidth="1.5"');
  content = content.replace(/strokeWidth="2\.5"/g, 'strokeWidth="1.5"');
  content = content.replace(/strokeWidth=\{2\}/g, 'strokeWidth={1.5}');
  content = content.replace(/strokeWidth=\{2\.5\}/g, 'strokeWidth={1.5}');

  if (content !== original) {
    fs.writeFileSync(file, content);
  }
});

console.log('Icon stroke weights updated to 1.5 for a premium minimalist look.');
