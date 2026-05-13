# How to Deploy BizPulse to Render

Follow these steps to ensure a successful deployment to Render:

## 1. Prepare your GitHub Repository
* Go to your repository on GitHub.
* If you have existing files from an old version, it is best to **delete them all** first.
* You can do this by clicking the "Add file" -> "Upload files" button, or using the GitHub CLI/Desktop.
* **CRITICAL:** The `package.json` file MUST be at the root of your repository. Do NOT upload the files inside a subfolder.

## 2. Upload Files
* Extract the ZIP file you downloaded from BizPulse.
* Open the extracted folder.
* Select **ALL** files and folders inside that folder (including `src`, `public`, `package.json`, `vite.config.ts`, etc.).
* Drag and drop them into your GitHub repository root.

## 3. Configure Render
* In your Render Dashboard, select your Web Service.
* Go to **Settings** -> **Environment Variables**.

### Required Backend Variables
* **FIREBASE_SERVICE_ACCOUNT**: Copy the **ENTIRE** content of your `serviceAccountKey.json` and paste it here.
* **GEMINI_API_KEY**: Your Google Gemini API Key.
* **JWT_SECRET**: A random secure string for session tokens.

### Required Frontend Variables (CRITICAL for site to load)
You must copy these from your `firebase-applet-config.json` file. Each variable MUST start with `VITE_`:
* **VITE_FIREBASE_API_KEY** (Starts with `AIza...`, usually about 39-40 characters. Ensure no spaces before or after.)
* **VITE_FIREBASE_AUTH_DOMAIN**
* **VITE_FIREBASE_PROJECT_ID**
* **VITE_FIREBASE_STORAGE_BUCKET**
* **VITE_FIREBASE_MESSAGING_SENDER_ID**
* **VITE_FIREBASE_APP_ID**
* **VITE_FIREBASE_FIRESTORE_DATABASE_ID** (Use `(default)` if unsure)

**CRITICAL:** 
1. Do NOT wrap values in quotes in the Render dashboard. Correct: `AIzaSy...`, Incorrect: `"AIzaSy..."`.
2. **WEB API KEY ONLY:** Ensure you are using the **Web API Key** found in your Firebase Project Settings -> General tab. Do NOT use a Service Account ID or Project ID here.
3. **API Key Format:** Valid keys usually start with `AIzaSy...` and are around 39 characters long.
4. **DOMAIN RESTRICTIONS:** If you restricted your API key in Google Cloud Console, ensure you have added `onrender.com` to the allowed domains.
5. **BYPASS CACHE:** After changing any variable starting with `VITE_`, you MUST click **"Manual Deploy" -> "Clear Build Cache & Deploy"** on Render. Simple restarts will NOT work because these variables are compiled into the site's code.

**Important:** If these VITE_ variables are missing, the website will show a **Configuration Required** screen on Render. If they are incorrect, you will see an **Invalid API Key** error when clicking Login.

## 4. Troubleshooting common errors

### `auth/api-key-not-valid`
This is the most common error. It happens when:
*   The `VITE_FIREBASE_API_KEY` was pasted incorrectly (e.g. with a space at the end).
*   The `VITE_` variables were added *after* the first build, and you haven't done a "Clear Build Cache & Deploy" yet.
*   You used the `messagingSenderId` or another ID instead of the `apiKey`.

### Error: "Could not read package.json"
If you see an error like `open '/opt/render/project/src/package.json': no such file or directory`:
1. Go to your Render Dashboard.
2. Select your Web Service.
3. Go to **Settings**.
4. Find the **Root Directory** field.
5. **Clear the field (make it empty)**. If it has `src` in it, delete it.
6. Scroll down and click **Save Changes**.
7. Click **Manual Deploy** -> **Clear Cache & Deploy**.

### Error: "Service account object must contain a string 'private_key' property"
1. Ensure your `FIREBASE_SERVICE_ACCOUNT` environment variable contains the **FULL JSON** from your `serviceAccountKey.json`.
2. It should start with `{` and end with `}`.
3. Don't just copy the private key; copy the whole file content.

## 5. Deleting old files from GitHub
Yes, it is highly recommended to **delete all existing files** in your GitHub repository before uploading the new ZIP contents. This ensures that no old configuration files or folders (like an old `src` folder) interfere with the new version.
