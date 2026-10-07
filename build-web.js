// build-web.js - Prepares www directory for Capacitor Android build
const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const outDir = path.join(__dirname, 'www');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'android', 'tests', 'supabase', 'www', 'public'].includes(entry.name)) {
        continue;
      }
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Building web bundle into www/...');
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Copy individual essential files
const filesToCopy = ['index.html', 'config.js'];
for (const file of filesToCopy) {
  const s = path.join(srcDir, file);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, path.join(outDir, file));
  }
}

// Copy directories
const dirsToCopy = ['lib', 'assets'];
for (const dir of dirsToCopy) {
  const s = path.join(srcDir, dir);
  if (fs.existsSync(s)) {
    copyDir(s, path.join(outDir, dir));
  }
}

// Also sync essential files to public/ for hosting providers that expect public/
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
['index.html', '404.html', 'config.js'].forEach(file => {
  const s = path.join(srcDir, file);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, path.join(publicDir, file));
  }
});
['lib', 'assets'].forEach(dir => {
  const s = path.join(srcDir, dir);
  if (fs.existsSync(s)) {
    copyDir(s, path.join(publicDir, dir));
  }
});

console.log('✓ Web bundle ready in www/ and synced to public/');

