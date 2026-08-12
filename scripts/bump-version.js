import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const gradlePath = path.join(process.cwd(), 'android/app/build.gradle');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json nicht gefunden');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version || '1.0.1';

if (!fs.existsSync(gradlePath)) {
  console.log('⚠️ build.gradle nicht gefunden unter:', gradlePath);
  process.exit(0);
}

let gradleContent = fs.readFileSync(gradlePath, 'utf8');

// 1. versionCode um +1 erhöhen
let newVersionCode = 1;
const versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
if (versionCodeMatch) {
  newVersionCode = parseInt(versionCodeMatch[1], 10) + 1;
  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
} else {
  gradleContent = gradleContent.replace(/defaultConfig\s*\{/, `defaultConfig {\n        versionCode 2`);
  newVersionCode = 2;
}

// 2. versionName synchronisieren mit package.json
const versionNameMatch = gradleContent.match(/versionName\s+"([^"]+)"/);
if (versionNameMatch) {
  gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${currentVersion}"`);
} else {
  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}\n        versionName "${currentVersion}"`);
}

fs.writeFileSync(gradlePath, gradleContent, 'utf8');

console.log(`🚀 [Build Pipeline] versionCode auf ${newVersionCode} erhöht.`);
console.log(`📦 [Build Pipeline] versionName synchronisiert auf v${currentVersion}.`);
