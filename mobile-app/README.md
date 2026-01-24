# Nexus Server Mobile App (React Native + Expo)

This is the **native mobile version** of your Nexus Server app with **full background push notifications** for iPhone.

## ✅ What You Get

- ✅ **Full background notifications** - Works even when app is closed
- ✅ **Native iOS app** - Runs natively on iPhone
- ✅ **No App Store needed** - Run via Expo Go
- ✅ **All features included** - PIN lock, FAKE/REAL modes, terminal, messaging
- ✅ **Random "Nexus Server" notifications** - Same dummy messages as before

---

## 📱 Setup Instructions (30 Minutes)

### Step 1: Install Node.js (If Not Already Installed)

1. Go to https://nodejs.org/
2. Download the **LTS version** (recommended)
3. Install it (just click Next/Next/Finish)
4. Open Terminal/Command Prompt and verify:
   ```bash
   node --version
   npm --version
   ```

### Step 2: Install Expo CLI

Open Terminal/Command Prompt and run:
```bash
npm install -g expo-cli
```

### Step 3: Install Expo Go on Your iPhone

1. Open **App Store** on your iPhone
2. Search for **"Expo Go"**
3. Install it (it's free)

### Step 4: Run the App

1. Open Terminal/Command Prompt
2. Navigate to this directory:
   ```bash
   cd /path/to/nexus-project/mobile-app
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the app:
   ```bash
   npm start
   ```
   Or:
   ```bash
   expo start
   ```

5. You'll see a **QR code** in your terminal

6. On your iPhone:
   - Open **Expo Go** app
   - Tap **"Scan QR Code"**
   - Point camera at the QR code on your computer screen
   - Wait for the app to load (30-60 seconds first time)

7. **Done!** The app will open on your iPhone

---

## 🔔 How Notifications Work

### Automatic Setup:
- When you first open the app, it will ask for notification permission
- Tap **"Allow"** when prompted
- Or tap the purple **"Enable Notifications"** banner

### Testing Notifications:
1. Open the app on your iPhone
2. Enter PIN **4387** (REAL mode)
3. Allow notifications when prompted
4. **Close the app** completely (swipe up in app switcher)
5. Send yourself a WhatsApp message from another device
6. You'll get a notification: **"Nexus Server: [Random Message]"**

### Background Notifications:
Unlike the web version, this **ACTUALLY WORKS** in the background:
- ✅ Works when app is closed
- ✅ Works when iPhone is locked
- ✅ Works 24/7 automatically
- ✅ No need to keep app open

---

## 🎯 Features Included

Everything from the web version:
- ✅ PIN lock (1331 = FAKE, 4387 = REAL)
- ✅ Fake terminal mode with commands
- ✅ Real WhatsApp messaging
- ✅ QR code scanning for WhatsApp login
- ✅ Dark/Light mode toggle
- ✅ Message history saved locally
- ✅ File sending (coming soon)

**PLUS:**
- ✅ True native background notifications
- ✅ Better performance
- ✅ Native iOS feel
- ✅ Works offline (messages cached)

---

## 🔧 Troubleshooting

### "Expo Go is not installed"
- Install Expo Go from the App Store

### "Cannot connect to Metro"
- Make sure your iPhone and computer are on the same WiFi network
- Try restarting with: `expo start --tunnel`

### "Notifications not working"
- Make sure you allowed notifications when prompted
- Check iPhone Settings → Expo Go → Notifications → Allow
- Restart the app

### QR code not scanning
- Make sure your iPhone camera can see the full QR code
- Try running: `expo start --tunnel`
- Use the manual connection: Type the URL shown in terminal into Expo Go

---

## 🚀 Daily Usage

Once set up, using the app is simple:

1. Open **Expo Go** on your iPhone
2. Tap **"Nexus Server"** in your recent apps
3. App opens instantly
4. Enter PIN and use normally

**Note:** App stays loaded for 24-48 hours. After that, just scan the QR code again (takes 10 seconds).

---

## 📊 Comparison: PWA vs Native

| Feature | Web PWA | Native App (This) |
|---------|---------|-------------------|
| Background notifications | Limited ❌ | Full support ✅ |
| Must keep app open | Yes ❌ | No ✅ |
| Works when closed | No ❌ | Yes ✅ |
| Setup time | 0 min ✅ | 30 min ⚠️ |
| App Store required | No ✅ | No ✅ |
| Expires | Never ✅ | Every 30 days ⚠️ |
| Performance | Good ✅ | Excellent ✅ |

---

## 🔄 Updating the App

If you make changes to the code:

1. Save the changes
2. Expo will **auto-reload** on your iPhone
3. No need to restart anything!

---

## 📦 Alternative: Build Standalone App (Advanced)

If you want an app that never expires:

1. Create free Expo account: https://expo.dev/signup
2. Run: `eas build --platform ios`
3. Install via TestFlight (requires Apple Developer account - $99/year)

But for most users, **Expo Go is perfect** - just re-scan QR every 30 days.

---

## ❓ Need Help?

**Common issues:**
- Same WiFi network for phone and computer
- Allow notifications when prompted
- Use `expo start --tunnel` if QR code doesn't work

**Test notifications:**
1. Allow notifications in app
2. Background the app
3. Send WhatsApp message
4. Should get "Nexus Server" notification immediately

---

## 🎉 That's It!

You now have a **fully native iOS app** with **real background notifications** that works exactly like a real app, without needing the App Store!

Enjoy your Nexus Server notifications! 📱✨
