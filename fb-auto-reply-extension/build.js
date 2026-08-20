const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Files to obfuscate
const filesToObfuscate = [
  'content/content.js',
  'popup/popup.js',
  'popup/popup-tabs.js',
  'background/background.js'
];

// Files to copy as-is (HTML, CSS, manifest)
const filesToCopy = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css'
];

const distDir = path.join(__dirname, 'dist');

// Obfuscation settings — tuned for Chrome extensions
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false, // keep console for debugging if needed
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // don't rename globals — Chrome API names must stay
  selfDefending: false, // can break in strict-mode extensions
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false
};

// Clean and recreate dist/
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}

// Obfuscate JS files
for (const file of filesToObfuscate) {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const code = fs.readFileSync(srcPath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);

  fs.writeFileSync(destPath, obfuscated.getObfuscatedCode());
  console.log(`✅ Obfuscated: ${file}`);
}

// Copy non-JS files
for (const file of filesToCopy) {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log(`📋 Copied: ${file}`);
}

console.log('\n🎉 Build complete! Obfuscated extension is in the dist/ folder.');
console.log('Load dist/ as an unpacked extension in chrome://extensions to use it.');
