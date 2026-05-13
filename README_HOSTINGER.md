# Hostinger Deployment Guide for BizPulse

This guide will help you deploy the BizPulse applet to Hostinger's Node.js environment.

## Prerequisites
- Hostinger Node.js hosting or VPS.
- Node.js 20+ installed.

## Quick Start (Pre-built Method)

This export contains **pre-compiled** files to bypass Hostinger's restricted environment:
- `dist/`: The finished frontend.
- `app.js` & `index.js`: The finished backend.

**Installation Steps:**
1. **Clear everything** on your Hostinger Node.js folder.
2. **Upload & Extract** the ZIP.
3. **Set your environment variables** in hPanel (see `.env.example`).
4. **Set Entry Point**: If Hostinger asks, set the entry point to `index.js`.
5. **Run `npm install`** (to get the underlying Node modules).
6. **DO NOT** run `npm run build` on Hostinger. It is already built!
7. **Start** the application.

## Troubleshooting
- **Firebase Errors**: Ensure `serviceAccountKey.json` is in the same folder as `index.js`.
- **White Screen**: Check if the `dist` folder was uploaded correctly.
- **Port Error**: Hostinger usually assigns a port automatically; the app is configured to listen on `0.0.0.0`.
- **Health Check**: Access `https://yourdomain.com/api/health` to verify the backend is alive.
