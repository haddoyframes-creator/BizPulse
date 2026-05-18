import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("main.tsx: Starting render...");

const container = document.getElementById('root');
if (!container) {
  console.error("main.tsx: Root container not found!");
} else {
  try {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    console.log("main.tsx: Render called.");
  } catch (error) {
    console.error("main.tsx: Top-level render error:", error);
    container.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; max-width: 600px; margin: auto; text-align: center;">
        <h1 style="color: #e11d48;">Application Initialization Failed</h1>
        <p style="color: #4b5563;">The application crashed during startup. This often happens due to missing environment variables or configuration errors.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: left; margin-top: 20px; overflow-x: auto;">
          <code style="color: #1f2937;">${error instanceof Error ? error.stack : String(error)}</code>
        </div>
        <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">Please check your browser console for more details.</p>
      </div>
    `;
  }
}
