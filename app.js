var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import admin from "firebase-admin";
console.log(`Server starting in ${process.env.NODE_ENV || "development"} mode...`);
var JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";
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
var getFirestore = () => {
  try {
    return admin.firestore();
  } catch (e) {
    return null;
  }
};
console.log("Using local SQLite database");
var db = new Database("bizpulse.db");
var uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    pin TEXT,
    subscription_tier TEXT DEFAULT 'free', -- 'free', 'basic', 'pro'
    subscription_status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL,
    is_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS business_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT DEFAULT 'My Business',
    logo_url TEXT,
    is_subscribed INTEGER DEFAULT 0,
    payment_gateway TEXT DEFAULT 'paystack', -- 'paystack', 'monnify'
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    photo_url TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('sale', 'expense')),
    amount REAL NOT NULL,
    category TEXT,
    date TEXT DEFAULT CURRENT_DATE,
    product_id INTEGER,
    customer_id INTEGER,
    quantity INTEGER DEFAULT 1,
    description TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES inventory(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TEXT DEFAULT CURRENT_DATE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);
db.prepare("INSERT OR IGNORE INTO users (id, email, password) VALUES (1, 'dev@example.com', 'password')").run();
db.prepare("INSERT OR IGNORE INTO business_info (user_id, name) VALUES (1, 'BizPulse User')").run();
try {
  db.prepare("ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free'").run();
} catch (e) {
}
try {
  db.prepare("ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'").run();
} catch (e) {
}
try {
  db.prepare("CREATE TABLE IF NOT EXISTS promo_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, tier TEXT NOT NULL, is_used INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
} catch (e) {
}
try {
  db.prepare("INSERT OR IGNORE INTO promo_codes (code, tier) VALUES (?, ?)").run("STAFF2026", "pro");
  db.prepare("INSERT OR IGNORE INTO promo_codes (code, tier) VALUES (?, ?)").run("GIFT5000", "pro");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN customer_id INTEGER").run();
  console.log("Migration: Added customer_id column to transactions");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE users ADD COLUMN pin TEXT").run();
  console.log("Migration: Added pin column to users");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE business_info ADD COLUMN payment_gateway TEXT DEFAULT 'paystack'").run();
  console.log("Migration: Added payment_gateway column to business_info");
} catch (e) {
}
var tables = ["inventory", "transactions", "customers", "business_info"];
for (const table of tables) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`).run();
    console.log(`Migration: Added user_id column to ${table}`);
  } catch (e) {
  }
}
try {
  db.prepare("ALTER TABLE inventory ADD COLUMN size TEXT").run();
  console.log("Migration: Added size column to inventory");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE inventory ADD COLUMN vat_status TEXT DEFAULT 'vatable'").run();
  console.log("Migration: Added vat_status column to inventory");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN vat_status TEXT DEFAULT 'vatable'").run();
  console.log("Migration: Added vat_status column to transactions");
} catch (e) {
}
try {
  db.prepare("ALTER TABLE transactions ADD COLUMN item_name TEXT").run();
  console.log("Migration: Added item_name column to transactions");
} catch (e) {
}
var app = express();
app.use(cors());
app.use(express.json());
var authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null || token === "null" || token === "undefined") {
    return res.status(401).json({ error: "Unauthorized", message: "No token provided" });
  }
  try {
    const decoded = jwt.decode(token);
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
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hashedPassword);
    const userId = result.lastInsertRowid;
    db.prepare("INSERT INTO business_info (user_id, name) VALUES (?, 'My Business')").run(userId);
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ message: "Registration successful", token, user: { id: userId, email } });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});
app.get("/api/auth/me", authenticateToken, (req, res) => {
  const user = db.prepare("SELECT id, email, pin, subscription_tier, subscription_status FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: { ...user, hasPin: !!user.pin } });
});
app.post("/api/subscription/promo", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Promo code is required" });
  try {
    const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ? AND is_used = 0").get(code);
    if (!promo) return res.status(400).json({ error: "Invalid or already used promo code" });
    db.prepare("UPDATE users SET subscription_tier = ?, subscription_status = 'active' WHERE id = ?").run(promo.tier, userId);
    db.prepare("UPDATE promo_codes SET is_used = 1 WHERE id = ?").run(promo.id);
    res.json({ success: true, tier: promo.tier });
  } catch (error) {
    res.status(500).json({ error: "Failed to apply promo code" });
  }
});
app.post("/api/subscription/upgrade", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { tier } = req.body;
  if (!["basic", "pro"].includes(tier)) return res.status(400).json({ error: "Invalid subscription tier" });
  try {
    db.prepare("UPDATE users SET subscription_tier = ?, subscription_status = 'active' WHERE id = ?").run(tier, userId);
    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: "Failed to upgrade subscription" });
  }
});
app.post("/api/auth/set-pin", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { pin } = req.body;
  if (!pin || pin.length < 4) return res.status(400).json({ error: "PIN must be at least 4 digits" });
  try {
    db.prepare("UPDATE users SET pin = ? WHERE id = ?").run(pin, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to set PIN" });
  }
});
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "./uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
var upload = multer({ storage });
app.use("/uploads", express.static("uploads"));
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    database: "sqlite"
  });
});
app.get("/api/download-source", async (req, res) => {
  try {
    const archiver = __require("archiver");
    const fs2 = __require("fs");
    const path2 = __require("path");
    const tempZipPath = path2.join(process.cwd(), "bizpulse-source-export.zip");
    const output = fs2.createWriteStream(tempZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }
      // Sets the compression level.
    });
    output.on("close", function() {
      res.download(tempZipPath, "bizpulse-source.zip", (err) => {
        if (err) {
          console.error("Error sending zip file:", err);
        }
        if (fs2.existsSync(tempZipPath)) {
          fs2.unlinkSync(tempZipPath);
        }
      });
    });
    archive.on("error", function(err) {
      console.error("Archiver error:", err);
      if (!res.headersSent) {
        res.status(500).send({ error: err.message });
      }
    });
    archive.pipe(output);
    archive.glob("**/*", {
      cwd: process.cwd(),
      dot: true,
      // Include hidden files like .gitignore
      ignore: [
        "node_modules/**",
        "dist/**",
        ".git/**",
        ".env",
        "uploads/**",
        "*.sqlite",
        "*.sqlite-journal",
        "*.db",
        "firebase-applet-config.json",
        "bizpulse-source-export.zip"
        // Ignore the temp file itself
      ]
    });
    await archive.finalize();
  } catch (err) {
    console.error("Zip generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate zip file" });
    }
  }
});
app.get("/api/business", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const info = db.prepare("SELECT * FROM business_info WHERE user_id = ?").get(userId);
    res.json(info || { user_id: userId, name: "My Business", logo_url: null, is_subscribed: 0 });
  } catch (err) {
    console.error("Business API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
app.post("/api/business", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { name, is_subscribed } = req.body;
  const existing = db.prepare("SELECT id FROM business_info WHERE user_id = ?").get(userId);
  if (existing) {
    if (name !== void 0) {
      db.prepare("UPDATE business_info SET name = ? WHERE user_id = ?").run(name, userId);
    }
    if (is_subscribed !== void 0) {
      db.prepare("UPDATE business_info SET is_subscribed = ? WHERE user_id = ?").run(is_subscribed ? 1 : 0, userId);
    }
  } else {
    db.prepare("INSERT INTO business_info (user_id, name, is_subscribed) VALUES (?, ?, ?)").run(
      userId,
      name || "My Business",
      is_subscribed ? 1 : 0
    );
  }
  res.json({ success: true });
});
app.post("/api/business/logo", authenticateToken, upload.single("logo"), async (req, res) => {
  const userId = req.user.id;
  if (req.file) {
    try {
      const logoUrl = `/uploads/${req.file.filename}`;
      db.prepare("UPDATE business_info SET logo_url = ? WHERE user_id = ?").run(logoUrl, userId);
      res.json({ logoUrl });
    } catch (error) {
      console.error("Logo Upload Error:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  } else {
    res.status(400).send("No file uploaded");
  }
});
app.post("/api/upload", authenticateToken, upload.single("photo"), async (req, res) => {
  if (req.file) {
    const photoUrl = `/uploads/${req.file.filename}`;
    res.json({ url: photoUrl });
  } else {
    res.status(400).send("No file uploaded");
  }
});
app.get("/api/inventory", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const items = db.prepare("SELECT * FROM inventory WHERE user_id = ?").all(userId);
    res.json(items);
  } catch (err) {
    console.error("Inventory API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
app.post("/api/inventory", authenticateToken, upload.single("photo"), async (req, res) => {
  const userId = req.user.id;
  try {
    const { name, description, price, stock, size, vat_status } = req.body;
    if (!name || price === void 0) {
      return res.status(400).json({ error: "Name and Price are required" });
    }
    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }
    const result = db.prepare(
      "INSERT INTO inventory (user_id, name, description, price, stock, photo_url, size, vat_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(userId, name, description, parseFloat(price) || 0, parseInt(stock) || 0, photoUrl, size, vat_status || "vatable");
    res.json({ id: result.lastInsertRowid, photoUrl });
  } catch (error) {
    console.error("Inventory Save Error Details:", error);
    res.status(500).json({
      error: "Failed to save product",
      message: error.message,
      details: typeof error === "object" ? JSON.stringify(error) : error
    });
  }
});
app.get("/api/customers", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const customers = db.prepare("SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC").all(userId);
    res.json(customers);
  } catch (err) {
    console.error("Customers API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
app.post("/api/customers", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const result = db.prepare(
      "INSERT INTO customers (user_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, name, email, phone, address);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error("Customers API Post Error:", err);
    res.status(500).json({ error: "Failed to save customer", message: err.message });
  }
});
app.get("/api/transactions", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const transactions = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC").all(userId);
    res.json(transactions);
  } catch (err) {
    console.error("Transactions API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
app.post("/api/transactions", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status } = req.body;
  const qty = parseInt(quantity) || 1;
  const transactionDate = date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, type, amount, category, transactionDate, product_id, customer_id, qty, description, item_name, vat_status || "vatable");
  if (product_id) {
    const stockChange = type === "sale" ? -qty : qty;
    db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(stockChange, product_id, userId);
  }
  res.json({ success: true });
});
app.delete("/api/inventory/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const pin = req.headers["x-pin"];
  const user = db.prepare("SELECT pin FROM users WHERE id = ?").get(userId);
  if (user.pin && user.pin !== pin) {
    return res.status(403).json({ error: "Invalid PIN" });
  }
  db.prepare("DELETE FROM inventory WHERE id = ? AND user_id = ?").run(id, userId);
  res.json({ success: true });
});
app.put("/api/inventory/:id", authenticateToken, upload.single("photo"), async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name, description, price, stock, size, vat_status } = req.body;
  try {
    let photoUrl = req.body.photo_url;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }
    db.prepare(
      "UPDATE inventory SET name = ?, description = ?, price = ?, stock = ?, photo_url = ?, size = ?, vat_status = ? WHERE id = ? AND user_id = ?"
    ).run(name, description, parseFloat(price), parseInt(stock), photoUrl, size, vat_status || "vatable", id, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.delete("/api/transactions/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const pin = req.headers["x-pin"];
  const user = db.prepare("SELECT pin FROM users WHERE id = ?").get(userId);
  if (user.pin && user.pin !== pin) {
    return res.status(403).json({ error: "Invalid PIN" });
  }
  try {
    const transaction = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(id, userId);
    if (transaction && transaction.product_id) {
      const stockRevert = transaction.type === "sale" ? transaction.quantity : -transaction.quantity;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(stockRevert, transaction.product_id, userId);
    }
    db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(id, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.put("/api/transactions/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status } = req.body;
  const qty = parseInt(quantity) || 1;
  try {
    const oldTx = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(id, userId);
    if (oldTx && oldTx.product_id) {
      const revert = oldTx.type === "sale" ? oldTx.quantity : -oldTx.quantity;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(revert, oldTx.product_id, userId);
    }
    if (product_id) {
      const change = type === "sale" ? -qty : qty;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(change, product_id, userId);
    }
    db.prepare(
      "UPDATE transactions SET type = ?, amount = ?, category = ?, date = ?, product_id = ?, customer_id = ?, quantity = ?, description = ?, item_name = ?, vat_status = ? WHERE id = ? AND user_id = ?"
    ).run(type, amount, category, date, product_id, customer_id, qty, description, item_name, vat_status || "vatable", id, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/stats", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END) as total_sales,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
        date
      FROM transactions
      WHERE user_id = ?
      GROUP BY date
      ORDER BY date ASC
    `).all(userId);
    res.json(stats);
  } catch (err) {
    console.error("Stats API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
app.post("/api/ai/verify-rc", authenticateToken, async (req, res) => {
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
        tools: [{ googleSearch: {} }]
      }
    });
    let data;
    try {
      const text = response.text || "{}";
      const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
      data = JSON.parse(cleanText);
    } catch (e) {
      const text = response.text || "";
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
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to verify RC number" });
  }
});
app.post("/api/ai/generate-tax-estimate", authenticateToken, async (req, res) => {
  const { taxType, year, businessType, annualTurnover, annualProfit, monthlySales, employees, avgSalary, state } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid." });
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  let reportFocus = "";
  if (taxType === "cit") {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${year} (e.g., 0% for small companies < \u20A625m, 20% for medium \u20A625m-\u20A6100m, 30% for large > \u20A6100m).
    2. Estimated Education Tax (Tertiary Education Trust Fund - TETFund) at 3% of assessable profit (if applicable for ${year}).
    3. Relevant tax incentives or exemptions applicable in ${year}.
    4. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${year} assessment year.
    `;
  } else if (taxType === "vat") {
    reportFocus = `
    Provide:
    1. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    2. Brief explanation of VAT filing obligations and deadlines for that period.
    3. A formal VAT report summary suitable for submission to the Federal Inland Revenue Service (FIRS).
    `;
  } else if (taxType === "paye") {
    reportFocus = `
    Provide:
    1. Estimated Pay As You Earn (PAYE) tax for the ${employees} employees based on the average monthly salary of \u20A6${avgSalary}.
    2. Breakdown of the Consolidated Relief Allowance (CRA) and the specific tax brackets (7%, 11%, 15%, 19%, 21%, 24%) applied to the taxable income.
    3. Estimated monthly and annual PAYE remittance to the ${state} State Internal Revenue Service.
    4. Brief explanation of PAYE filing obligations and deadlines.
    `;
  } else {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${year} (e.g., 0% for small companies < \u20A625m, 20% for medium \u20A625m-\u20A6100m, 30% for large > \u20A6100m).
    2. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    3. Estimated Education Tax (Tertiary Education Trust Fund - TETFund) at 3% of assessable profit (if applicable for ${year}).
    4. Estimated Pay As You Earn (PAYE) tax for the ${employees} employees based on the average monthly salary of \u20A6${avgSalary}, showing the tax brackets applied.
    5. Relevant tax incentives or exemptions applicable in ${year}.
    6. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) and ${state} State Internal Revenue Service for the ${year} assessment year.
    `;
  }
  const prompt = `
    As a Nigerian tax expert, provide an annual tax estimate for the year ${year} for the following business:
    - Business Type: ${businessType}
    - Annual Turnover: \u20A6${annualTurnover}
    - Annual Net Profit: \u20A6${annualProfit}
    - Monthly Sales Data (Array of 12 months, each containing vatable, exempt, and zero_rated sales): ${JSON.stringify(monthlySales)}
    - Number of Employees: ${employees}
    - Average Monthly Salary per Employee: \u20A6${avgSalary}
    - State of Operation: ${state}
    
    IMPORTANT: Base this estimate on the Nigerian tax laws (Finance Acts, CIT, PIT, etc.) as they existed in ${year}.
    
    ${reportFocus}
    
    Format the response in Markdown.
  `;
  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json({ estimate: result.text });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate estimate" });
  }
});
app.post("/api/ai/business-insights", authenticateToken, async (req, res) => {
  const { businessName, transactions, customQuestion } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid." });
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  const totalRevenue = transactions.filter((t) => t.type === "sale").reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const basePrompt = `
    You are an expert AI Business Advisor for a Nigerian business named "${businessName || "the business"}".
    Here is their financial summary:
    - Total Revenue: \u20A6${totalRevenue.toLocaleString()}
    - Total Expenses: \u20A6${totalExpenses.toLocaleString()}
    - Net Profit: \u20A6${netProfit.toLocaleString()}
    
    Recent Transactions (up to 20):
    ${JSON.stringify(transactions)}
  `;
  const prompt = customQuestion ? `${basePrompt}

The user has a specific question: "${customQuestion}"
Provide a helpful, professional, and actionable response based on their financial data.` : `${basePrompt}

Please provide 3-5 personalized, actionable business insights or recommendations based on this data. Focus on cash flow, expense reduction, or revenue growth opportunities. Format the response in Markdown.`;
  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json({ insights: result.text });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate insights" });
  }
});
async function fetchFromExternalDirectory(rcNumber) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const mockDatabase = {
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
app.post("/api/business/manual-entry", authenticateToken, async (req, res) => {
  const { name, registration_number, business_type, address, registration_date } = req.body;
  if (!name || !registration_number) return res.status(400).json({ error: "Name and Registration Number are required" });
  const db2 = getFirestore();
  if (!db2) return res.status(503).json({ error: "Database not available" });
  try {
    const docRef = db2.collection("businesses").doc(registration_number);
    const doc = await docRef.get();
    if (doc.exists) {
      return res.status(409).json({ error: "Business already exists in our records" });
    }
    const businessData = {
      name,
      registration_number,
      business_type: business_type || "Business Name",
      address: address || "",
      registration_date: registration_date || "",
      source: "user submitted",
      verification_status: "unverified",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await docRef.set(businessData);
    res.json({ success: true, business: businessData });
  } catch (err) {
    console.error("Manual Entry Error:", err);
    res.status(500).json({ error: "Failed to save business", message: err.message });
  }
});
app.post("/api/business/lookup", authenticateToken, async (req, res) => {
  const { registration_number } = req.body;
  if (!registration_number) return res.status(400).json({ error: "Registration Number is required" });
  const db2 = getFirestore();
  if (!db2) return res.status(503).json({ error: "Database not available" });
  try {
    const docRef = db2.collection("businesses").doc(registration_number);
    const doc = await docRef.get();
    if (doc.exists) {
      return res.json({ source: "internal", business: doc.data() });
    }
    try {
      const externalData = await fetchFromExternalDirectory(registration_number);
      if (externalData && externalData.name !== "NOT_FOUND") {
        const businessData = {
          name: externalData.name,
          registration_number,
          business_type: "LTD",
          // Defaulting to LTD for RC numbers, or we could try to guess
          address: externalData.address || "",
          registration_date: "",
          source: "directory",
          verification_status: "unverified",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        await docRef.set(businessData);
        return res.json({ source: "external", business: businessData });
      }
      res.status(404).json({ error: "Business not found in external directories" });
    } catch (extErr) {
      console.error("External Lookup Error:", extErr);
      res.status(500).json({ error: "External lookup failed", message: extErr.message });
    }
  } catch (err) {
    console.error("Internal Lookup Error:", err);
    res.status(500).json({ error: "Lookup failed", message: err.message });
  }
});
app.get("/api/business/details/:registration_number", authenticateToken, async (req, res) => {
  const { registration_number } = req.params;
  const db2 = getFirestore();
  if (!db2) return res.status(503).json({ error: "Database not available" });
  try {
    const doc = await db2.collection("businesses").doc(registration_number).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Business not found" });
    }
    res.json(doc.data());
  } catch (err) {
    console.error("Fetch Details Error:", err);
    res.status(500).json({ error: "Failed to fetch business details", message: err.message });
  }
});
app.patch("/api/business/verify", authenticateToken, async (req, res) => {
  const { registration_number, verification_proof } = req.body;
  if (!registration_number) return res.status(400).json({ error: "Registration Number is required" });
  const db2 = getFirestore();
  if (!db2) return res.status(503).json({ error: "Database not available" });
  try {
    const docRef = db2.collection("businesses").doc(registration_number);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Business not found" });
    }
    await docRef.update({
      verification_status: "verified",
      source: "verified",
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      verification_proof: verification_proof || "User confirmed"
    });
    res.json({ success: true, message: "Business verified successfully" });
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ error: "Verification failed", message: err.message });
  }
});
app.post("/api/advice", authenticateToken, async (req, res) => {
  const { period, year, transactions, inventory } = req.body;
  const selectedYear = year || (/* @__PURE__ */ new Date()).getFullYear();
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
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json({ advice: result.text });
  } catch (error) {
    console.error("AI Error:", error);
    const errorStr = String(error);
    if (errorStr.includes("API key not valid") || error.status === 400 || error.message?.includes("API_KEY_INVALID")) {
      return res.status(400).json({ error: "Invalid Gemini API key. Please check your AI Studio Secrets panel and ensure you have a valid key configured." });
    }
    res.status(500).json({ error: "Failed to generate advice" });
  }
});
app.post("/api/tax-estimate", authenticateToken, async (req, res) => {
  const { businessType, turnover, profit, monthlySales, employees, state, year, taxType } = req.body;
  const selectedYear = year || (/* @__PURE__ */ new Date()).getFullYear();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.status(400).json({ error: "Gemini API key is missing or invalid. Please configure it in the AI Studio Secrets panel." });
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  let reportFocus = "";
  if (taxType === "cit") {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${selectedYear} (e.g., 0% for small companies < \u20A625m, 20% for medium \u20A625m-\u20A6100m, 30% for large > \u20A6100m).
    2. Estimated Education Tax (if applicable for ${selectedYear}).
    3. Relevant tax incentives or exemptions applicable in ${selectedYear}.
    4. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${selectedYear} assessment year.
    `;
  } else if (taxType === "vat") {
    reportFocus = `
    Provide:
    1. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    2. Brief explanation of VAT filing obligations and deadlines for that period.
    3. A formal VAT report summary suitable for submission to the Federal Inland Revenue Service (FIRS).
    `;
  } else {
    reportFocus = `
    Provide:
    1. Estimated Company Income Tax (CIT) according to the Nigerian tax law for ${selectedYear} (e.g., 0% for small companies < \u20A625m, 20% for medium \u20A625m-\u20A6100m, 30% for large > \u20A6100m).
    2. A detailed monthly breakdown of Value Added Tax (VAT) at 7.5% for products that are VATable for every month based on the monthly sales provided.
    3. Estimated Education Tax (if applicable for ${selectedYear}).
    4. Relevant tax incentives or exemptions applicable in ${selectedYear}.
    5. A formal report summary suitable for submission to the Federal Inland Revenue Service (FIRS) for the ${selectedYear} assessment year.
    `;
  }
  const prompt = `
    As a Nigerian tax expert, provide an annual tax estimate for the year ${selectedYear} for the following business:
    - Business Type: ${businessType}
    - Annual Turnover: \u20A6${turnover}
    - Annual Net Profit: \u20A6${profit}
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
      contents: [{ parts: [{ text: prompt }] }]
    });
    res.json({ estimate: result.text });
  } catch (error) {
    console.error("AI Tax Error:", error);
    const errorStr = String(error);
    if (errorStr.includes("API key not valid") || error.status === 400 || error.message?.includes("API_KEY_INVALID")) {
      return res.status(400).json({ error: "Invalid Gemini API key. Please check your AI Studio Secrets panel and ensure you have a valid key configured." });
    }
    res.status(500).json({ error: "Failed to generate tax estimate" });
  }
});
async function startServer() {
  const PORT = Number(process.env.PORT) || 3e3;
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Starting Vite in development mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      console.log("Starting in production mode...");
      app.use(express.static("dist"));
      app.get("*", (req, res) => res.sendFile(path.resolve("dist/index.html")));
    }
    app.use((err, req, res, next) => {
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
