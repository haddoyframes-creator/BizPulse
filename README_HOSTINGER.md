# Hostinger Deployment Guide for BizPulse

This guide will help you deploy the BizPulse applet to Hostinger's Node.js environment.

## Prerequisites
- Hostinger Node.js hosting or VPS.
- Node.js 20+ installed.

## Steps

1.  **Upload Files**: Upload all files from this repository to your Hostinger account (excluding `node_modules` and `.git`).
2.  **Environment Variables**:
    -   In your Hostinger Node.js dashboard, set the environment variables listed in `.env.example`.
    -   **CRITICAL**: Set `NODE_ENV=production`.
    -   **CRITICAL**: Set `PORT` (Hostinger usually sets this automatically).
    -   **CRITICAL**: Set `GEMINI_API_KEY` for AI features.
    -   **CRITICAL**: Set `JWT_SECRET` to a long, random string.
3.  **Install Dependencies**:
    -   Run `npm install` in the terminal (or via the Hostinger dashboard).
4.  **Build the App**:
    -   Run `npm run build`. This will generate the `dist` folder for the frontend and compile `server.ts` into `app.js` for the backend.
5.  **Start the Server**:
    -   Hostinger will automatically look for `app.js` as the entry point, which is now generated during the build step.
    -   The `start` script is configured as `NODE_ENV=production node app.js`.
    -   If your Hostinger environment requires you to specify the startup file, set it to `app.js`.

## Database & Native Modules
- This app uses **SQLite** (`better-sqlite3`).
- **IMPORTANT**: `better-sqlite3` is a native module. If Hostinger's environment doesn't have prebuilt binaries for your OS, it will try to compile it. This requires `node-gyp` and build tools (like `gcc`, `make`).
- If you encounter issues with `better-sqlite3`, ensure your Hostinger Node.js version matches one of the prebuilt binary versions (usually the latest LTS).

## Troubleshooting
- If you see "Vite not found" errors, ensure you've run `npm install`.
- If the app doesn't start, check the logs in the Hostinger dashboard.
- Ensure the `PORT` in `server.ts` correctly matches what Hostinger expects.
- If you get "Module not found" for `tsx`, ensure it is in your `dependencies` (not `devDependencies`).
