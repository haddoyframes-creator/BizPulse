import "dotenv/config";
console.log(`Server starting in ${process.env.NODE_ENV || 'development'} mode...`);
import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import admin from "firebase-admin";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.resolve("firebase-applet-config.json");
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("firebase-applet-config.json not found. Firebase Admin not initialized.");
  }
} catch (e) {
  console.error("Failed to initialize Firebase Admin:", e);
}

const getFirestore = () => {
  try {
    return admin.firestore();
  } catch (e) {
    return null;
  }
};

// Ensure uploads directory exists
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: "Unauthorized", message: "No token provided" });
  }

  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded) {
      return res.status(403).json({ error: "Forbidden", message: "Invalid token" });
    }
    
    const userId = decoded.user_id || decoded.id || decoded.sub;
    if (!userId) {
      return res.status(403).json({ error: "Forbidden", message: "Token missing user identifier" });
    }
    
    req.user = { id: userId, email: decoded.email };
    next();
  } catch (err) {
    return res.status(403).json({ error: "Forbidden", message: "Token verification failed" });
  }
};

// Auth Routes
// (Auth is handled entirely by Firebase in the frontend)

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "./uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    database: "firestore"
  });
});

app.get("/api/download-source", authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    
    // Check if admin
    let isAdmin = email?.toLowerCase() === 'haddoyframes@gmail.com';
    
    if (!isAdmin) {
      const fsDb = getFirestore();
      if (fsDb) {
        const userDoc = await fsDb.collection('users').doc(userId).get();
        if (userDoc.exists && userDoc.data()?.role === 'admin') {
          isAdmin = true;
        }
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden", message: "Only administrators can export the project source code." });
    }

    const archiver = require('archiver');
    const fs = require('fs');
    const path = require('path');
    
    const tempZipPath = path.join(process.cwd(), 'bizpulse-source-export.zip');
    const output = fs.createWriteStream(tempZipPath);
    
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    output.on('close', function() {
      // Send the file once it's fully written to disk
      res.download(tempZipPath, 'bizpulse-source.zip', (err) => {
        if (err) {
          console.error("Error sending zip file:", err);
        }
        // Clean up the temporary file after sending
        if (fs.existsSync(tempZipPath)) {
          fs.unlinkSync(tempZipPath);
        }
      });
    });

    archive.on('error', function(err: any) {
      console.error('Archiver error:', err);
      if (!res.headersSent) {
        res.status(500).send({error: err.message});
      }
    });

    archive.pipe(output);

    // Append files from the current directory
    archive.glob('**/*', {
      cwd: process.cwd(),
      dot: true, // Include hidden files like .gitignore
      ignore: [
        'node_modules/**', 
        'dist/**', 
        '.git/**', 
        '.env*', 
        'uploads/**', 
        '*.sqlite', 
        '*.sqlite-journal', 
        '*.db', 
        '*.db-journal',
        'firebase-applet-config.json',
        'app.js',
        '*.zip',
        'test-*.ts',
        'bizpulse-source-export.zip'
      ]
    });

    await archive.finalize();

  } catch (err: any) {
    console.error('Zip generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate zip file" });
    }
  }
});

// (CRUD operations are handled entirely by Firebase in the frontend)

app.post("/api/ai/verify-rc", authenticateToken, async (req: any, res) => {
  const { rcNumber } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid." });
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a corporate registry assistant. Your task is to find the exact company details for a Nigerian company registered with the Corporate Affairs Commission (CAC) using its RC number (Registration Number).
      The RC number to search for is: ${rcNumber}.
      Use Google Search to find the official company name, registered address, and primary business activity. Search specifically for "RC ${rcNumber} Nigeria" or look up CAC directories.
      It is CRITICAL that you return the exact company name associated with this specific RC number. Do not guess or return a similar company. If you are not 100% sure, return "NOT_FOUND" for the name.
      Return ONLY a raw JSON object with the following keys:
      - "name": The full official registered company name (or "NOT_FOUND" if you cannot find a definitive match for this exact RC number)
      - "address": The registered office address (or empty string if not found)
      - "activity": The primary nature of business or activity (or empty string if not found)
      Do not include any markdown formatting or backticks.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let data;
    try {
      const text = response.text || '{}';
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(cleanText);
    } catch (e) {
      const text = response.text || '';
      const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
      const addressMatch = text.match(/"address"\s*:\s*"([^"]+)"/);
      const activityMatch = text.match(/"activity"\s*:\s*"([^"]+)"/);
      
      data = {
        name: nameMatch ? nameMatch[1] : "NOT_FOUND",
        address: addressMatch ? addressMatch[1] : "",
        activity: activityMatch ? activityMatch[1] : ""
      };
    }
    res.json(data);
  } catch (error: any) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to verify RC number" });
  }
});

app.post("/api/ai/generate-tax-estimate", authenticateToken, async (req: any, res) => {
  const { taxType, year, businessType, annualTurnover, annualProfit, monthlySales, employees, avgSalary, state } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid." });
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  let reportFocus = "";
  if (taxType === 'cit') {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${year} (e.g., 0% for small companies < ₦25m, 20% for medium ₦25m-₦100m, 30% for large > ₦100m).
    2. Estimated Education Tax (Tertiary Education Trust Fund - TETFund) at 3% of assessable profit (if applicable for ${year}).
    3. Relevant tax incentives or exemptions applicable in ${year}.
    4. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${year} assessment year.
    `;
  } else if (taxType === 'vat') {
    reportFocus = `
    Provide:
    1. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    2. Brief explanation of VAT filing obligations and deadlines for that period.
    3. A formal VAT report summary suitable for submission to the Federal Inland Revenue Service (FIRS).
    `;
  } else if (taxType === 'paye') {
    reportFocus = `
    Provide:
    1. Estimated Pay As You Earn (PAYE) tax for the ${employees} employees based on the average monthly salary of ₦${avgSalary}.
    2. Breakdown of the Consolidated Relief Allowance (CRA) and the specific tax brackets (7%, 11%, 15%, 19%, 21%, 24%) applied to the taxable income.
    3. Estimated monthly and annual PAYE remittance to the ${state} State Internal Revenue Service.
    4. Brief explanation of PAYE filing obligations and deadlines.
    `;
  } else {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${year} (e.g., 0% for small companies < ₦25m, 20% for medium ₦25m-₦100m, 30% for large > ₦100m).
    2. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    3. Estimated Education Tax (Tertiary Education Trust Fund - TETFund) at 3% of assessable profit (if applicable for ${year}).
    4. Estimated Pay As You Earn (PAYE) tax for the ${employees} employees based on the average monthly salary of ₦${avgSalary}, showing the tax brackets applied.
    5. Relevant tax incentives or exemptions applicable in ${year}.
    6. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) and ${state} State Internal Revenue Service for the ${year} assessment year.
    `;
  }
  
  const prompt = `
    As a Nigerian tax expert, provide an annual tax estimate for the year ${year} for the following business:
    - Business Type: ${businessType}
    - Annual Turnover: ₦${annualTurnover}
    - Annual Net Profit: ₦${annualProfit}
    - Monthly Sales Data (Array of 12 months, each containing vatable, exempt, and zero_rated sales): ${JSON.stringify(monthlySales)}
    - Number of Employees: ${employees}
    - Average Monthly Salary per Employee: ₦${avgSalary}
    - State of Operation: ${state}
    
    IMPORTANT: Base this estimate on the Nigerian tax laws (Finance Acts, CIT, PIT, etc.) as they existed in ${year}.
    
    ${reportFocus}
    
    Format the response in Markdown.
  `;

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    res.json({ estimate: result.text });
  } catch (error: any) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate estimate" });
  }
});

app.post("/api/ai/business-insights", authenticateToken, async (req: any, res) => {
  const { businessName, transactions, customQuestion } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid." });
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  const totalRevenue = transactions.filter((t: any) => t.type === 'sale').reduce((sum: number, t: any) => sum + t.amount, 0);
  const totalExpenses = transactions.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + t.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const basePrompt = `
    You are an expert AI Business Advisor for a Nigerian business named "${businessName || 'the business'}".
    Here is their financial summary:
    - Total Revenue: ₦${totalRevenue.toLocaleString()}
    - Total Expenses: ₦${totalExpenses.toLocaleString()}
    - Net Profit: ₦${netProfit.toLocaleString()}
    
    Recent Transactions (up to 20):
    ${JSON.stringify(transactions)}
  `;

  const prompt = customQuestion 
    ? `${basePrompt}\n\nThe user has a specific question: "${customQuestion}"\nProvide a helpful, professional, and actionable response based on their financial data.`
    : `${basePrompt}\n\nPlease provide 3-5 personalized, actionable business insights or recommendations based on this data. Focus on cash flow, expense reduction, or revenue growth opportunities. Format the response in Markdown.`;

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    res.json({ insights: result.text });
  } catch (error: any) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate insights" });
  }
});

// ===============================================================
// NEW BACKEND BUSINESS ENDPOINTS
// ===============================================================

// Helper for Mock External Directory Lookup
async function fetchFromExternalDirectory(rcNumber: string) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Mock data for demonstration purposes
  const mockDatabase: Record<string, any> = {
    "1234567": {
      name: "DANGOTE CEMENT PLC",
      address: "1 ALFRED REWANE ROAD, IKOYI, LAGOS",
      activity: "MANUFACTURING"
    },
    "7654321": {
      name: "FLUTTERWAVE TECHNOLOGY SOLUTIONS LIMITED",
      address: "8 PROVIDENCE STREET, LEKKI PHASE 1, LAGOS",
      activity: "INFORMATION TECHNOLOGY"
    },
    "1111111": {
      name: "ZENITH BANK PLC",
      address: "PLOT 84, AJOSE ADEOGUN STREET, VICTORIA ISLAND, LAGOS",
      activity: "FINANCIAL SERVICES"
    }
  };

  const data = mockDatabase[rcNumber];
  
  if (data) {
    return data;
  }
  
  return { name: "NOT_FOUND" };
}

app.post("/api/business/manual-entry", authenticateToken, async (req: any, res) => {
  const { name, registration_number, business_type, address, registration_date } = req.body;
  if (!name || !registration_number) return res.status(400).json({ error: "Name and Registration Number are required" });

  const db = getFirestore();
  if (!db) return res.status(503).json({ error: "Database not available" });

  try {
    const docRef = db.collection('businesses').doc(registration_number);
    const doc = await docRef.get();

    if (doc.exists) {
      return res.status(409).json({ error: "Business already exists in our records" });
    }

    const businessData = {
      name,
      registration_number,
      business_type: business_type || 'Business Name',
      address: address || '',
      registration_date: registration_date || '',
      source: 'user submitted',
      verification_status: 'unverified',
      updated_at: new Date().toISOString()
    };

    await docRef.set(businessData);
    res.json({ success: true, business: businessData });
  } catch (err: any) {
    console.error("Manual Entry Error:", err);
    res.status(500).json({ error: "Failed to save business", message: err.message });
  }
});

app.post("/api/business/lookup", authenticateToken, async (req: any, res) => {
  const { registration_number } = req.body;
  if (!registration_number) return res.status(400).json({ error: "Registration Number is required" });

  const db = getFirestore();
  if (!db) return res.status(503).json({ error: "Database not available" });

  try {
    const docRef = db.collection('businesses').doc(registration_number);
    const doc = await docRef.get();

    if (doc.exists) {
      return res.json({ source: 'internal', business: doc.data() });
    }

    // Not found in internal DB, use external directory lookup
    try {
      const externalData = await fetchFromExternalDirectory(registration_number);
      
      if (externalData && externalData.name !== "NOT_FOUND") {
        const businessData = {
          name: externalData.name,
          registration_number,
          business_type: 'LTD', // Defaulting to LTD for RC numbers, or we could try to guess
          address: externalData.address || '',
          registration_date: '',
          source: 'directory',
          verification_status: 'unverified',
          updated_at: new Date().toISOString()
        };
        
        await docRef.set(businessData);
        return res.json({ source: 'external', business: businessData });
      }
      
      res.status(404).json({ error: "Business not found in external directories" });
    } catch (extErr: any) {
      console.error("External Lookup Error:", extErr);
      res.status(500).json({ error: "External lookup failed", message: extErr.message });
    }
  } catch (err: any) {
    console.error("Internal Lookup Error:", err);
    res.status(500).json({ error: "Lookup failed", message: err.message });
  }
});

app.get("/api/business/details/:registration_number", authenticateToken, async (req: any, res) => {
  const { registration_number } = req.params;
  
  const db = getFirestore();
  if (!db) return res.status(503).json({ error: "Database not available" });

  try {
    const doc = await db.collection('businesses').doc(registration_number).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Business not found" });
    }
    res.json(doc.data());
  } catch (err: any) {
    console.error("Fetch Details Error:", err);
    res.status(500).json({ error: "Failed to fetch business details", message: err.message });
  }
});

app.patch("/api/business/verify", authenticateToken, async (req: any, res) => {
  const { registration_number, verification_proof } = req.body;
  if (!registration_number) return res.status(400).json({ error: "Registration Number is required" });

  const db = getFirestore();
  if (!db) return res.status(503).json({ error: "Database not available" });

  try {
    const docRef = db.collection('businesses').doc(registration_number);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Business not found" });
    }

    await docRef.update({
      verification_status: 'verified',
      source: 'verified',
      updated_at: new Date().toISOString(),
      verification_proof: verification_proof || 'User confirmed'
    });

    res.json({ success: true, message: "Business verified successfully" });
  } catch (err: any) {
    console.error("Verification Error:", err);
    res.status(500).json({ error: "Verification failed", message: err.message });
  }
});

app.post("/api/advice", authenticateToken, async (req: any, res) => {
  const { period, year, transactions, inventory } = req.body; // weekly, monthly, annual
  const selectedYear = year || new Date().getFullYear();
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid. Please configure it in the AI Studio Secrets panel." });
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze this business data for a ${period} report in the year ${selectedYear}:
    Transactions: ${JSON.stringify(transactions || [])}
    Inventory: ${JSON.stringify(inventory || [])}
    
    Provide:
    1. A summary of financial performance (Profit/Loss) for ${selectedYear}.
    2. 3 actionable financial advice points for improvement based on this historical data.
    3. If annual, format a brief section matching CAC Nigeria standards for annual returns (Turnover, Net Assets, etc.).
    
    Format the response in Markdown.
  `;

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    res.json({ advice: result.text });
  } catch (error: any) {
    console.error("AI Error:", error);
    const errorStr = String(error);
    if (errorStr.includes("API key not valid") || error.status === 400 || error.message?.includes("API_KEY_INVALID")) {
      return res.status(400).json({ error: "Invalid Gemini API key. Please check your AI Studio Secrets panel and ensure you have a valid key configured." });
    }
    res.status(500).json({ error: "Failed to generate advice" });
  }
});

app.post("/api/tax-estimate", authenticateToken, async (req: any, res) => {
  const { businessType, turnover, profit, monthlySales, employees, state, year, taxType } = req.body;
  const selectedYear = year || new Date().getFullYear();
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid. Please configure it in the AI Studio Secrets panel." });
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";

  let reportFocus = "";
  if (taxType === 'cit') {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${selectedYear} (e.g., 0% for small companies < ₦25m, 20% for medium ₦25m-₦100m, 30% for large > ₦100m).
    2. Estimated Education Tax (if applicable for ${selectedYear}).
    3. Relevant tax incentives or exemptions applicable in ${selectedYear}.
    4. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${selectedYear} assessment year.
    `;
  } else if (taxType === 'vat') {
    reportFocus = `
    Provide:
    1. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    2. Brief explanation of VAT filing obligations and deadlines for that period.
    3. A formal VAT report summary suitable for submission to the Federal Inland Revenue Service (FIRS).
    `;
  } else {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${selectedYear} (e.g., 0% for small companies < ₦25m, 20% for medium ₦25m-₦100m, 30% for large > ₦100m).
    2. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    3. Estimated Education Tax (if applicable for ${selectedYear}).
    4. Relevant tax incentives or exemptions applicable in ${selectedYear}.
    5. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${selectedYear} assessment year.
    `;
  }
  
    const prompt = `
    As a Nigerian tax expert, provide an annual tax estimate for the year ${selectedYear} for the following business:
    - Business Type: ${businessType}
    - Annual Turnover: ₦${turnover}
    - Annual Net Profit: ₦${profit}
    - Monthly Sales Data (Array of 12 months, each containing vatable, exempt, and zero_rated sales): ${JSON.stringify(monthlySales)}
    - Number of Employees: ${employees}
    - State of Operation: ${state}
    
    IMPORTANT: Base this estimate on the Nigerian tax laws (Finance Acts, CIT, PIT, etc.) as they existed in ${selectedYear}.
    
    ${reportFocus}
    
    Format the response in clear Markdown with bold headings and use tables where appropriate.
  `;

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
    });
    res.json({ estimate: result.text });
  } catch (error: any) {
    console.error("AI Tax Error:", error);
    const errorStr = String(error);
    if (errorStr.includes("API key not valid") || error.status === 400 || error.message?.includes("API_KEY_INVALID")) {
      return res.status(400).json({ error: "Invalid Gemini API key. Please check your AI Studio Secrets panel and ensure you have a valid key configured." });
    }
    res.status(500).json({ error: "Failed to generate tax estimate" });
  }
});


async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Starting Vite in development mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      console.log("Starting in production mode...");
      app.use(express.static("dist"));
      app.get("*", (req, res) => res.sendFile(path.resolve("dist/index.html")));
    }

    // Global error handler
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("Express Error:", err);
      res.status(500).json({ error: err.message || "Internal Server Error" });
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();
