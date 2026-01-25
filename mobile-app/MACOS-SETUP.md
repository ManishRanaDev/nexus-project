# 🍎 Complete Setup Guide - MacBook + iPhone

This guide will help you build and install the Nexus Server native app on your iPhone using your MacBook. **No Ubuntu needed!**

---

## ✅ What You Need

- ✅ MacBook (any Mac will work)
- ✅ iPhone
- ✅ USB cable (Lightning or USB-C depending on your iPhone)
- ✅ Apple ID (free account, no paid developer account needed)
- ✅ 1 hour of time (mostly waiting for build)

---

## 🚀 Part 1: Setup MacBook (15 minutes)

### **Step 1: Install Homebrew** (3 min)

Open **Terminal** (Cmd+Space, type "Terminal", press Enter)

```bash
# Install Homebrew (Mac's package manager)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Press Enter when prompted, enter your Mac password**

After installation, run:
```bash
# Add Homebrew to PATH (for Apple Silicon Macs)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Verify:
```bash
brew --version
```

You should see something like `Homebrew 4.x.x`

---

### **Step 2: Install Node.js** (2 min)

```bash
brew install node
```

Verify:
```bash
node --version
npm --version
```

You should see versions like `v20.x.x` and `10.x.x`

---

### **Step 3: Install EAS CLI** (2 min)

```bash
npm install -g eas-cli
```

Verify:
```bash
eas --version
```

---

### **Step 4: Get the Project Code** (3 min)

```bash
# Navigate to your preferred folder
cd ~/Documents

# Clone the repository
git clone https://github.com/ManishRanaDev/nexus-project.git

# Navigate to mobile app folder
cd nexus-project/mobile-app

# Install dependencies
npm install
```

This takes 3-5 minutes. Let it finish completely.

---

### **Step 5: Login to Expo** (1 min)

```bash
eas login
```

**Enter your Expo account credentials:**
- Username: `manishnexus` (or whatever you used)
- Password: [your password]

---

## 🏗️ Part 2: Build the App (30-40 minutes)

### **Step 6: Start the Build** (Active: 5 min, Wait: 30 min)

```bash
eas build --platform ios --profile development
```

**You'll be asked several questions. Here's what to answer:**

#### Question 1: "Would you like to log in to your Apple account?"
```
? Log in to your Apple account › (Y/n)
```
**Answer: `Y`**

#### Question 2: "Apple ID"
```
? Apple ID:
```
**Enter your Apple ID email** (the one you use for App Store)

#### Question 3: "Password"
```
? Password (for testmanish007@gmail.com):
```
**Enter your Apple ID password**

#### Question 4: "Two-factor authentication"
Your iPhone will show a 6-digit code.
```
? Two-factor authentication code:
```
**Enter the 6-digit code from your iPhone**

#### Question 5: "Register new devices?"
```
? You don't have any registered devices yet. Would you like to register them now? › (Y/n)
```
**Answer: `Y`**

#### Question 6: Connect iPhone
```
› Connect your iOS device via USB
```

**Connect your iPhone to Mac with USB cable**
- Unlock your iPhone
- Tap **"Trust This Computer"** when prompted
- Enter iPhone passcode

**EAS will detect your iPhone and continue**

#### Question 7: "Generate a new Apple Distribution Certificate?"
```
? Generate a new Apple Distribution Certificate? › (Y/n)
```
**Answer: `Y`**

#### Question 8: "Generate a new Apple Provisioning Profile?"
```
? Generate a new Apple Provisioning Profile? › (Y/n)
```
**Answer: `Y`**

---

### **Step 7: Wait for Build** (30 minutes)

You'll see:
```
✔ Uploaded to EAS
✔ Build in queue...

See logs: https://expo.dev/accounts/manishnexus/projects/nexus-server/builds/xxxxx

Waiting for build to complete. You can press Ctrl+C to exit.
```

**☕ Take a break!** The build takes 20-30 minutes. Your MacBook doesn't do anything - Expo's servers build the app in the cloud.

When done, you'll see:
```
✔ Build finished
https://expo.dev/accounts/manishnexus/projects/nexus-server/builds/xxxxx
```

**Save this URL!** You'll need it to download the app.

---

## 📱 Part 3: Install on iPhone (15 minutes)

### **Step 8: Install AltServer on Mac** (5 min)

1. Download AltServer: https://altstore.io/
2. Download the **Mac version**
3. Open the `.dmg` file
4. Drag **AltServer** to Applications folder
5. Open **AltServer** from Applications
6. Look in your **menu bar** (top right) - you'll see a diamond-shaped icon

---

### **Step 9: Install AltStore on iPhone** (3 min)

**Connect iPhone to Mac via USB cable**

1. Click the **AltServer icon** in menu bar
2. Select **"Install AltStore"**
3. Choose your iPhone from the list
4. Enter your **Apple ID** and **password** when prompted
5. Wait 1-2 minutes

**On your iPhone:**
1. Go to **Settings** → **General** → **VPN & Device Management**
2. Tap your **Apple ID email** under "Developer App"
3. Tap **"Trust [your email]"**
4. Tap **"Trust"** again to confirm
5. AltStore icon appears on your home screen ✅

---

### **Step 10: Download the Built App** (2 min)

**Option A: On MacBook**
1. Open the build URL from Step 7 in Safari
2. Click **"Download"** button
3. Save as `nexus-server.ipa` in Downloads folder
4. **AirDrop** the file to your iPhone:
   - Right-click the file → Share → AirDrop
   - Select your iPhone
   - Accept on iPhone
   - File saves to Files app → Downloads

**Option B: On iPhone**
1. Open the build URL from Step 7 in Safari on iPhone
2. Tap **"Download"**
3. File saves to Files app → Downloads

---

### **Step 11: Install App via AltStore** (3 min)

**On your iPhone:**

1. Open **AltStore** app
2. Tap **"My Apps"** tab (bottom)
3. Tap **"+"** button (top left corner)
4. Navigate to **Files** → **Downloads**
5. Select `nexus-server.ipa`
6. Wait 1-2 minutes for installation
7. **"Nexus Server"** appears on home screen! 🎉

---

## 🔔 Part 4: Enable Notifications & Test (5 minutes)

### **Step 12: Open App & Enable Notifications** (2 min)

**On iPhone:**

1. Tap **"Nexus Server"** icon on home screen
2. App opens to PIN screen
3. Enter PIN: **`4387`** (for REAL mode with WhatsApp)
4. You'll see a **purple banner** at top: "🔔 Enable Notifications"
5. Tap the **"Enable"** button on the banner
6. iOS popup appears: **"Nexus Server Would Like to Send You Notifications"**
7. Tap **"Allow"**
8. **Immediately** you get a test notification! 📬
   - "Nexus Server: [Random server message]"

✅ **Notifications are working!**

---

### **Step 13: Test Background Notifications** (2 min)

Now let's test if it works when the app is closed:

1. **Close the app completely:**
   - Swipe up from bottom (or double-click home button)
   - Swipe the Nexus Server app away to close it
2. **Lock your iPhone** (press power button)
3. From **another device**, send yourself a **WhatsApp message**
4. **BOOM! 💥** Notification appears on locked iPhone:
   ```
   Nexus Server
   Database backup completed
   ```
   (or another random server message)

✅ **Perfect! Background notifications are working!**

---

## 🎉 You're Done!

### What You Have Now:

- ✅ Native iOS app installed on iPhone
- ✅ Full background notifications (works when app closed)
- ✅ Works when iPhone is locked
- ✅ Random "Nexus Server" dummy messages
- ✅ All features: PIN lock, FAKE terminal, REAL WhatsApp mode
- ✅ Nothing needs to run on MacBook anymore!

---

## 🔄 Important: App Refresh (Every 7 Days)

Apps installed via AltStore expire after **7 days**. Here's how to refresh:

### **Option 1: Quick Refresh (iPhone Only)**

1. Open **AltStore** on iPhone
2. Tap **"My Apps"**
3. Tap **"Refresh"** next to Nexus Server
4. Done! (Takes 5 seconds)

**Note:** This only works if you've opened AltStore within the last 7 days.

### **Option 2: Via Mac (If Option 1 Fails)**

1. Connect iPhone to Mac via USB
2. Make sure **AltServer is running** on Mac (check menu bar)
3. Open **AltStore** on iPhone
4. Tap **"Refresh"**
5. Done!

### **Option 3: Auto-Refresh (Optional, $3/year)**

Support AltStore on Patreon for $3/year and get automatic background refresh!
- https://www.patreon.com/rileytestut

---

## 📋 Quick Reference Commands

```bash
# Setup (one time)
brew install node
npm install -g eas-cli
cd ~/Documents
git clone https://github.com/ManishRanaDev/nexus-project.git
cd nexus-project/mobile-app
npm install

# Login
eas login

# Build
eas build --platform ios --profile development

# Wait for build → Download .ipa → Install via AltStore
```

---

## 🆘 Troubleshooting

### Build Issues

**"Command not found: brew"**
- Reinstall Homebrew (Step 1)

**"Command not found: eas"**
```bash
npm install -g eas-cli
```

**Build failed with errors**
- Check the build logs at the URL provided
- Make sure you're logged into Expo: `eas whoami`
- Try again: `eas build --platform ios --profile development --clear-cache`

### iPhone Connection Issues

**"No devices found"**
- Reconnect iPhone via USB
- Unlock iPhone
- Tap "Trust This Computer" again
- Make sure iTunes/Finder can see your iPhone

**AltStore won't install**
- Make sure Mail app is running on Mac
- Make sure iPhone and Mac are on same WiFi network
- Try uninstalling and reinstalling AltServer

### App Installation Issues

**"Unable to install"**
- Make sure you trusted the developer certificate:
  Settings → General → VPN & Device Management → Trust
- Delete the app and try installing again from AltStore

**App opens then crashes**
- Make sure your backend is running at `https://nexubacksend.shop`
- Check if you have internet connection
- Try deleting and reinstalling the app

### Notification Issues

**No notification permission dialog**
- Make sure you tapped the purple "Enable Notifications" banner
- Check Settings → Nexus Server → Notifications → Allow

**Notifications not appearing when app closed**
- Make sure you allowed notifications
- Make sure app isn't force-closed (check in app switcher)
- Test by sending a WhatsApp message from another device

---

## 💡 Tips & Tricks

### Using FAKE Mode (Terminal)

Enter PIN: **`1331`**
- Shows a fake terminal interface
- Available commands: `help`, `system status`, `whoami`, `uptime`, etc.
- Dark/Light mode toggle
- Perfect for showing off without exposing real WhatsApp

### Using REAL Mode (WhatsApp)

Enter PIN: **`4387`**
- Connects to actual WhatsApp backend
- Shows QR code if not connected
- Send/receive messages
- Background notifications for incoming messages only

### Switching Modes

- Press **"Lock"** button in app
- You'll return to PIN screen
- Enter different PIN to switch modes

---

## 🎯 Success Checklist

Before you start:
- [ ] MacBook with Terminal access
- [ ] iPhone with USB cable
- [ ] Apple ID credentials ready
- [ ] 1 hour of time available

After Part 1 (Setup):
- [ ] Homebrew installed (`brew --version` works)
- [ ] Node.js installed (`node --version` works)
- [ ] EAS CLI installed (`eas --version` works)
- [ ] Project cloned and dependencies installed
- [ ] Logged into Expo (`eas whoami` shows username)

After Part 2 (Build):
- [ ] Build started successfully
- [ ] Waited for build to complete (30 min)
- [ ] Got download URL for .ipa file

After Part 3 (Install):
- [ ] AltServer installed on Mac
- [ ] AltStore installed on iPhone
- [ ] Trusted developer certificate on iPhone
- [ ] .ipa file downloaded
- [ ] App installed via AltStore
- [ ] App icon visible on home screen

After Part 4 (Test):
- [ ] App opens successfully
- [ ] Entered PIN 4387
- [ ] Notification permission granted
- [ ] Received test notification
- [ ] Tested background notification (app closed)
- [ ] Background notification received! 🎉

---

## 🌟 You Did It!

Congratulations! You now have a fully functional native iOS app with real background notifications, without needing the App Store or a paid developer account!

Enjoy your Nexus Server notifications! 📱✨
