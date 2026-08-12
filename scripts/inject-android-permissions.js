import fs from 'fs';
import path from 'path';

const manifestPath = path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('⚠️ AndroidManifest.xml nicht gefunden unter:', manifestPath);
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf8');

const permissionsToInject = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
];

let injectedCount = 0;
permissionsToInject.forEach((perm) => {
  const permNameMatch = perm.match(/name="([^"]+)"/);
  if (permNameMatch) {
    const permName = permNameMatch[1];
    if (!content.includes(permName)) {
      content = content.replace('</manifest>', `    ${perm}\n</manifest>`);
      injectedCount++;
    }
  } else if (!content.includes(perm)) {
    content = content.replace('</manifest>', `    ${perm}\n</manifest>`);
    injectedCount++;
  }
});

fs.writeFileSync(manifestPath, content, 'utf8');
console.log(`✅ ${injectedCount} native Android Berechtigungen wurden erfolgreich in AndroidManifest.xml injiziert!`);
