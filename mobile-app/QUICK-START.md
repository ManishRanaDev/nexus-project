# 🚀 Quick Start - Get Running in 30 Minutes

Follow these exact steps to get your native iPhone app with background notifications working.

---

## ⚡ Step 1: Install Node.js (5 minutes)

### On Windows:
1. Go to https://nodejs.org/
2. Click the big green **"LTS"** button (currently v20.x.x)
3. Download and run the installer
4. Click Next → Next → Next → Install
5. Done!

### On Mac:
1. Go to https://nodejs.org/
2. Click the big green **"LTS"** button
3. Download and run the .pkg file
4. Click Continue → Install
5. Done!

### Verify Installation:
Open Terminal (Mac) or Command Prompt (Windows) and type:
```bash
node --version
npm --version
```

You should see version numbers. If yes, ✅ you're ready!

---

## ⚡ Step 2: Install Expo CLI (2 minutes)

In your terminal, run this one command:

```bash
npm install -g expo-cli
```

Wait for it to finish (1-2 minutes). Done!

---

## ⚡ Step 3: Install Expo Go on iPhone (1 minute)

1. Open **App Store** on your iPhone
2. Search: **"Expo Go"**
3. Tap **Get** (it's free)
4. Wait for download
5. Done! Keep it installed

---

## ⚡ Step 4: Run the App (20 minutes first time, 10 seconds after)

### Navigate to the project:

**On Windows:**
```bash
cd C:\path\to\nexus-project\mobile-app
```

**On Mac/Linux:**
```bash
cd /path/to/nexus-project/mobile-app
```

### Install dependencies (first time only):
```bash
npm install
```

This takes 5-10 minutes. Let it finish.

### Start the app:
```bash
npm start
```

Or:
```bash
expo start
```

**You'll see:**
- Some text scrolling by
- A QR code appears in your terminal
- "Metro waiting on..." message

✅ **Don't close this terminal!** Keep it running.

---

## ⚡ Step 5: Connect Your iPhone (2 minutes)

1. **Make sure your iPhone and computer are on the same WiFi**
2. Open **Expo Go** app on your iPhone
3. Tap **"Scan QR Code"** at the bottom
4. Point your camera at the QR code in your terminal
5. Wait 30-60 seconds (first time only)
6. **The app opens!** 🎉

---

## ⚡ Step 6: Enable Notifications (30 seconds)

1. When app opens, enter PIN: **4387** (for REAL mode)
2. Tap the purple **"Enable Notifications"** banner
3. iOS asks: **"Allow Notifications?"** → Tap **Allow**
4. You'll immediately get a test notification!
5. Done! ✅

---

## 🧪 Test It Works

1. **Close the app** completely (swipe up, swipe away)
2. **Lock your iPhone**
3. **Send yourself a WhatsApp message** from another device
4. **You should get a notification:** "Nexus Server: Database backup completed" (or similar)

✅ **If you got the notification, IT WORKS!**

---

## 🎯 Daily Use

After the first setup, using the app daily is simple:

1. Open **Expo Go** on iPhone
2. Tap **"Nexus Server"** (shows in recent projects)
3. App opens in 5 seconds
4. Enter PIN
5. Use normally

**The app stays loaded for 24-48 hours.** After that, just scan the QR code again (takes 10 seconds).

---

## 🆘 Troubleshooting

### "Cannot connect to Metro"
- ✅ Make sure iPhone and computer are on **same WiFi**
- ✅ Try: `expo start --tunnel`

### "QR code not scanning"
- ✅ Make sure camera can see full QR code
- ✅ Try: `expo start --tunnel` (uses internet instead of local WiFi)

### "Notifications not appearing"
- ✅ Make sure you tapped "Allow" when prompted
- ✅ Go to: iPhone Settings → Expo Go → Notifications → Turn ON
- ✅ Restart the app and try again

### "Expo Go says 'Something went wrong'"
- ✅ Make sure you ran `npm install` first
- ✅ Delete node_modules folder and run `npm install` again
- ✅ Try: `npm start --clear`

---

## 📋 Commands Cheat Sheet

```bash
# First time setup (in mobile-app folder)
npm install          # Install dependencies
npm start           # Start the app

# Daily use
npm start           # Start the app
expo start --tunnel # If same WiFi doesn't work

# Troubleshooting
npm start --clear   # Clear cache and restart
```

---

## ✅ Success Checklist

Before asking for help, make sure:
- [ ] Node.js is installed (`node --version` works)
- [ ] Expo CLI is installed (`expo --version` works)
- [ ] Expo Go is installed on iPhone
- [ ] iPhone and computer on same WiFi
- [ ] Ran `npm install` in mobile-app folder
- [ ] Terminal shows QR code
- [ ] Scanned QR code with Expo Go
- [ ] Allowed notifications when prompted
- [ ] Tested by sending WhatsApp message

If all checked ✅ and still not working, check the main README.md for more help.

---

## 🎉 You're Done!

Enjoy your **native iPhone app** with **real background notifications**!

No App Store needed. No complex setup. Just works! 📱✨
