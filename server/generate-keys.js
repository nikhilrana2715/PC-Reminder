const webPush = require('web-push');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  const vapidKeys = webPush.generateVAPIDKeys();
  const envContent = `PORT=3001
VAPID_PUBLIC_KEY=${vapidKeys.publicKey}
VAPID_PRIVATE_KEY=${vapidKeys.privateKey}
VAPID_SUBJECT=mailto:admin@neumoremind.app
`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('Generated VAPID Keys and created .env file!');
} else {
  console.log('.env file already exists.');
}
