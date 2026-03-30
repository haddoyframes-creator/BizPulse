import "dotenv/config";
console.log("Server starting...");
import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
// Supabase is temporarily disabled to focus on local stability
const isSupabaseConfigured = false; // Set to true and provide keys to re-enable
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (supabase) {
  console.log("Supabase client initialized");
} else {
  console.log("Using local SQLite database");
}

// Keep SQLite as a fallback or for local dev if keys are missing
const db = new Database("bizpulse.db");

// Ensure uploads directory exists
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize Database
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

// Create default user for development bypass
db.prepare("INSERT OR IGNORE INTO users (id, email, password) VALUES (1, 'dev@example.com', 'password')").run();
db.prepare("INSERT OR IGNORE INTO business_info (user_id, name) VALUES (1, 'BizPulse User')").run();

// Migrations
try {
  db.prepare("ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'").run();
} catch (e) {}

try {
  db.prepare("CREATE TABLE IF NOT EXISTS promo_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, tier TEXT NOT NULL, is_used INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
} catch (e) {}

// Seed a staff/test promo code
try {
  db.prepare("INSERT OR IGNORE INTO promo_codes (code, tier) VALUES (?, ?)").run('STAFF2026', 'pro');
  db.prepare("INSERT OR IGNORE INTO promo_codes (code, tier) VALUES (?, ?)").run('GIFT5000', 'pro');
} catch (e) {}

try {
  db.prepare("ALTER TABLE transactions ADD COLUMN customer_id INTEGER").run();
  console.log("Migration: Added customer_id column to transactions");
} catch (e) {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN pin TEXT").run();
  console.log("Migration: Added pin column to users");
} catch (e) {}

try {
  db.prepare("ALTER TABLE business_info ADD COLUMN payment_gateway TEXT DEFAULT 'paystack'").run();
  console.log("Migration: Added payment_gateway column to business_info");
} catch (e) {}

const tables = ['inventory', 'transactions', 'customers', 'business_info'];
for (const table of tables) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`).run();
    console.log(`Migration: Added user_id column to ${table}`);
  } catch (e) {}
}

try {
  db.prepare("ALTER TABLE inventory ADD COLUMN size TEXT").run();
  console.log("Migration: Added size column to inventory");
} catch (e) {}

try {
  db.prepare("ALTER TABLE inventory ADD COLUMN vat_status TEXT DEFAULT 'vatable'").run();
  console.log("Migration: Added vat_status column to inventory");
} catch (e) {}

try {
  db.prepare("ALTER TABLE transactions ADD COLUMN vat_status TEXT DEFAULT 'vatable'").run();
  console.log("Migration: Added vat_status column to transactions");
} catch (e) {}

try {
  db.prepare("ALTER TABLE transactions ADD COLUMN item_name TEXT").run();
  console.log("Migration: Added item_name column to transactions");
} catch (e) {}

const app = express();
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
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, hashedPassword);
    const userId = result.lastInsertRowid;
    
    db.prepare("INSERT INTO business_info (user_id, name) VALUES (?, 'My Business')").run(userId);
    
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Registration successful", token, user: { id: userId, email } });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  const user = db.prepare("SELECT id, email, pin, subscription_tier, subscription_status FROM users WHERE id = ?").get(req.user.id) as any;
  res.json({ user: { ...user, hasPin: !!user.pin } });
});

app.post("/api/subscription/promo", authenticateToken, (req: any, res) => {
  const userId = req.user.id;
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: "Promo code is required" });

  try {
    const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ? AND is_used = 0").get(code) as any;
    if (!promo) return res.status(400).json({ error: "Invalid or already used promo code" });

    db.prepare("UPDATE users SET subscription_tier = ?, subscription_status = 'active' WHERE id = ?").run(promo.tier, userId);
    db.prepare("UPDATE promo_codes SET is_used = 1 WHERE id = ?").run(promo.id);

    res.json({ success: true, tier: promo.tier });
  } catch (error) {
    res.status(500).json({ error: "Failed to apply promo code" });
  }
});

app.post("/api/subscription/upgrade", authenticateToken, (req: any, res) => {
  const userId = req.user.id;
  const { tier } = req.body;

  if (!['basic', 'pro'].includes(tier)) return res.status(400).json({ error: "Invalid subscription tier" });

  try {
    // In a real app, you'd verify payment here
    db.prepare("UPDATE users SET subscription_tier = ?, subscription_status = 'active' WHERE id = ?").run(tier, userId);
    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: "Failed to upgrade subscription" });
  }
});

app.post("/api/auth/set-pin", authenticateToken, async (req: any, res) => {
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
    database: supabase ? "supabase" : "sqlite"
  });
});

app.get("/api/download-source", async (req, res) => {
  try {
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
        '.env', 
        'uploads/**', 
        '*.sqlite', 
        '*.sqlite-journal', 
        '*.db', 
        'firebase-applet-config.json',
        'bizpulse-source-export.zip' // Ignore the temp file itself
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

app.get("/api/business", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('business_info').select('*').eq('user_id', userId).single();
      if (!error && data) {
        return res.json(data);
      }
      if (error && error.code !== 'PGRST116') {
        console.error("Supabase Business Error:", JSON.stringify(error));
      }
    }
    const info = db.prepare("SELECT * FROM business_info WHERE user_id = ?").get(userId);
    res.json(info || { user_id: userId, name: 'My Business', logo_url: null, is_subscribed: 0 });
  } catch (err: any) {
    console.error("Business API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

app.post("/api/business", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { name, is_subscribed } = req.body;
  
  try {
    if (supabase) {
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (is_subscribed !== undefined) updates.is_subscribed = is_subscribed ? 1 : 0;
      
      // Check if exists
      const { data: existing, error: checkError } = await supabase.from('business_info').select('id').eq('user_id', userId).single();
      
      if (!checkError || checkError.code === 'PGRST116') {
        if (existing) {
          const { error: updateError } = await supabase.from('business_info').update(updates).eq('user_id', userId);
          if (!updateError) return res.json({ success: true });
          console.error("Supabase Business Update Error:", JSON.stringify(updateError));
        } else {
          const { error: insertError } = await supabase.from('business_info').insert([{ user_id: userId, ...updates }]);
          if (!insertError) return res.json({ success: true });
          console.error("Supabase Business Insert Error:", JSON.stringify(insertError));
        }
      } else {
        console.error("Supabase Business Check Error:", JSON.stringify(checkError));
      }
    }
  } catch (err) {
    console.error("Supabase Business Post Exception:", err);
  }

  // Fallback to SQLite
  const existing = db.prepare("SELECT id FROM business_info WHERE user_id = ?").get(userId);
  if (existing) {
    if (name !== undefined) {
      db.prepare("UPDATE business_info SET name = ? WHERE user_id = ?").run(name, userId);
    }
    if (is_subscribed !== undefined) {
      db.prepare("UPDATE business_info SET is_subscribed = ? WHERE user_id = ?").run(is_subscribed ? 1 : 0, userId);
    }
  } else {
    db.prepare("INSERT INTO business_info (user_id, name, is_subscribed) VALUES (?, ?, ?)").run(
      userId, 
      name || 'My Business', 
      is_subscribed ? 1 : 0
    );
  }
  res.json({ success: true });
});

app.post("/api/business/logo", authenticateToken, upload.single("logo"), async (req: any, res) => {
  const userId = req.user.id;
  if (req.file) {
    try {
      // If Supabase is configured, upload there
      if (supabase) {
        const file = req.file;
        const fileExt = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExt}`;
        const filePath = `logos/${fileName}`;

        const { data, error } = await supabase.storage
          .from('bizpulse-assets')
          .upload(filePath, fs.readFileSync(file.path), {
            contentType: file.mimetype,
            upsert: true
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('bizpulse-assets')
          .getPublicUrl(filePath);

        db.prepare("UPDATE business_info SET logo_url = ? WHERE user_id = ?").run(publicUrl, userId);
        
        // Clean up local file
        fs.unlinkSync(file.path);
        
        return res.json({ logoUrl: publicUrl });
      }

      // Fallback to local
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

app.post("/api/upload", authenticateToken, upload.single("photo"), async (req: any, res) => {
  if (req.file) {
    const photoUrl = `/uploads/${req.file.filename}`;
    res.json({ url: photoUrl });
  } else {
    res.status(400).send("No file uploaded");
  }
});

app.get("/api/inventory", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('inventory').select('*').eq('user_id', userId);
      if (!error && data) {
        return res.json(data);
      }
      if (error) {
        console.error("Supabase Inventory Error:", JSON.stringify(error));
      }
    }
    const items = db.prepare("SELECT * FROM inventory WHERE user_id = ?").all(userId);
    res.json(items);
  } catch (err: any) {
    console.error("Inventory API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

app.post("/api/inventory", authenticateToken, upload.single("photo"), async (req: any, res) => {
  const userId = req.user.id;
  try {
    const { name, description, price, stock, size, vat_status } = req.body;
    
    if (!name || price === undefined) {
      return res.status(400).json({ error: "Name and Price are required" });
    }

    let photoUrl = null;
    if (req.file) {
      if (supabase) {
        try {
          const file = req.file;
          const fileExt = path.extname(file.originalname);
          const fileName = `${Date.now()}${fileExt}`;
          const filePath = `inventory/${fileName}`;

          const { data, error } = await supabase.storage
            .from('bizpulse-assets')
            .upload(filePath, fs.readFileSync(file.path), {
              contentType: file.mimetype,
              upsert: true
            });

          if (error) throw error;

          const { data: { publicUrl } } = supabase.storage
            .from('bizpulse-assets')
            .getPublicUrl(filePath);
          
          photoUrl = publicUrl;
          fs.unlinkSync(file.path);
        } catch (uploadErr) {
          console.error("Supabase Upload Error:", uploadErr);
          // Fallback to local if upload fails
          photoUrl = `/uploads/${req.file.filename}`;
        }
      } else {
        photoUrl = `/uploads/${req.file.filename}`;
      }
    }

    if (supabase) {
      const { data, error } = await supabase.from('inventory').insert([{
        user_id: userId, name, description, price: parseFloat(price), stock: parseInt(stock) || 0, photo_url: photoUrl, size, vat_status: vat_status || 'vatable'
      }]).select();
      
      if (error) {
        console.error("Supabase Inventory Insert Error:", JSON.stringify(error));
        if (error.code === '42P01' || error.code === '42703') {
          console.warn(`Supabase ${error.code === '42P01' ? 'table' : 'column'} error. Falling back to SQLite.`);
        } else {
          // For other errors, we still try SQLite but log the issue
          console.error("Unexpected Supabase error, trying SQLite fallback...");
        }
      } else if (data && data.length > 0) {
        return res.json({ id: data[0].id, photoUrl });
      }
    }

    const result = db.prepare(
      "INSERT INTO inventory (user_id, name, description, price, stock, photo_url, size, vat_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(userId, name, description, parseFloat(price) || 0, parseInt(stock) || 0, photoUrl, size, vat_status || 'vatable');
    
    res.json({ id: result.lastInsertRowid, photoUrl });
  } catch (error: any) {
    console.error("Inventory Save Error Details:", error);
    res.status(500).json({ 
      error: "Failed to save product", 
      message: error.message,
      details: typeof error === 'object' ? JSON.stringify(error) : error 
    });
  }
});

app.get("/api/customers", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('customers').select('*').eq('user_id', userId).order('name', { ascending: true });
      if (!error && data) {
        return res.json(data);
      }
      if (error) {
        console.error("Supabase Customers Error:", JSON.stringify(error));
      }
    }
    const customers = db.prepare("SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC").all(userId);
    res.json(customers);
  } catch (err: any) {
    console.error("Customers API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

app.post("/api/customers", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  
  try {
    if (supabase) {
      const { data, error } = await supabase.from('customers').insert([{ user_id: userId, name, email, phone, address }]).select();
      if (!error && data && data.length > 0) {
        return res.json({ id: data[0].id });
      }
      if (error) {
        console.error("Supabase Customers Post Error:", JSON.stringify(error));
      }
    }

    const result = db.prepare(
      "INSERT INTO customers (user_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, name, email, phone, address);
    
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) {
    console.error("Customers API Post Error:", err);
    res.status(500).json({ error: "Failed to save customer", message: err.message });
  }
});

app.get("/api/transactions", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false });
      if (!error && data) {
        return res.json(data);
      }
      if (error) {
        console.error("Supabase Transactions Error:", JSON.stringify(error));
      }
    }
    const transactions = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC").all(userId);
    res.json(transactions);
  } catch (err: any) {
    console.error("Transactions API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

app.post("/api/transactions", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status } = req.body;
  const qty = parseInt(quantity) || 1;
  const transactionDate = date || new Date().toISOString().split('T')[0];

  try {
    if (supabase) {
      const { error: insertError } = await supabase.from('transactions').insert([{
        user_id: userId, type, amount, category, date: transactionDate, product_id, customer_id, quantity: qty, description, item_name, vat_status: vat_status || 'vatable'
      }]);
      
      if (!insertError) {
        if (product_id) {
          const stockChange = type === 'sale' ? -qty : qty;
          const { data: product } = await supabase.from('inventory').select('stock').eq('id', product_id).eq('user_id', userId).single();
          if (product) {
            await supabase.from('inventory').update({ stock: product.stock + stockChange }).eq('id', product_id).eq('user_id', userId);
          }
        }
        return res.json({ success: true });
      }
      console.error("Supabase Transactions Post Error:", JSON.stringify(insertError));
    }
  } catch (err) {
    console.error("Supabase Transactions Post Exception:", err);
  }

  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, type, amount, category, transactionDate, product_id, customer_id, qty, description, item_name, vat_status || 'vatable');
  
  // Update stock if a product is associated
  if (product_id) {
    const stockChange = type === 'sale' ? -qty : qty;
    db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(stockChange, product_id, userId);
  }
  
  res.json({ success: true });
});

app.delete("/api/inventory/:id", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const pin = req.headers['x-pin'];

  const user = db.prepare("SELECT pin FROM users WHERE id = ?").get(userId) as any;
  if (user.pin && user.pin !== pin) {
    return res.status(403).json({ error: "Invalid PIN" });
  }
  
  try {
    if (supabase) {
      const { error } = await supabase.from('inventory').delete().eq('id', id).eq('user_id', userId);
      if (!error) return res.json({ success: true });
    }
  } catch (err) {}

  db.prepare("DELETE FROM inventory WHERE id = ? AND user_id = ?").run(id, userId);
  res.json({ success: true });
});

app.put("/api/inventory/:id", authenticateToken, upload.single("photo"), async (req: any, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name, description, price, stock, size, vat_status } = req.body;

  try {
    let photoUrl = req.body.photo_url;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    if (supabase) {
      const { error } = await supabase.from('inventory').update({
        name, description, price: parseFloat(price), stock: parseInt(stock), photo_url: photoUrl, size, vat_status: vat_status || 'vatable'
      }).eq('id', id).eq('user_id', userId);
      if (!error) return res.json({ success: true });
    }

    db.prepare(
      "UPDATE inventory SET name = ?, description = ?, price = ?, stock = ?, photo_url = ?, size = ?, vat_status = ? WHERE id = ? AND user_id = ?"
    ).run(name, description, parseFloat(price), parseInt(stock), photoUrl, size, vat_status || 'vatable', id, userId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/transactions/:id", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const pin = req.headers['x-pin'];

  const user = db.prepare("SELECT pin FROM users WHERE id = ?").get(userId) as any;
  if (user.pin && user.pin !== pin) {
    return res.status(403).json({ error: "Invalid PIN" });
  }
  
  try {
    // Get transaction details first to revert stock
    const transaction = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(id, userId) as any;
    
    if (transaction && transaction.product_id) {
      const stockRevert = transaction.type === 'sale' ? transaction.quantity : -transaction.quantity;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(stockRevert, transaction.product_id, userId);
      
      if (supabase) {
        const { data: product } = await supabase.from('inventory').select('stock').eq('id', transaction.product_id).single();
        if (product) {
          await supabase.from('inventory').update({ stock: product.stock + stockRevert }).eq('id', transaction.product_id);
        }
      }
    }

    if (supabase) {
      await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId);
    }

    db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(id, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/transactions/:id", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { type, amount, category, date, product_id, customer_id, quantity, description, item_name, vat_status } = req.body;
  const qty = parseInt(quantity) || 1;

  try {
    // Revert old stock if product was linked
    const oldTx = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(id, userId) as any;
    if (oldTx && oldTx.product_id) {
      const revert = oldTx.type === 'sale' ? oldTx.quantity : -oldTx.quantity;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(revert, oldTx.product_id, userId);
    }

    // Apply new stock if product is linked
    if (product_id) {
      const change = type === 'sale' ? -qty : qty;
      db.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ? AND user_id = ?").run(change, product_id, userId);
    }

    if (supabase) {
      await supabase.from('transactions').update({
        type, amount, category, date, product_id, customer_id, quantity: qty, description, item_name, vat_status: vat_status || 'vatable'
      }).eq('id', id).eq('user_id', userId);
    }

    db.prepare(
      "UPDATE transactions SET type = ?, amount = ?, category = ?, date = ?, product_id = ?, customer_id = ?, quantity = ?, description = ?, item_name = ?, vat_status = ? WHERE id = ? AND user_id = ?"
    ).run(type, amount, category, date, product_id, customer_id, qty, description, item_name, vat_status || 'vatable', id, userId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stats", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('transactions').select('type, amount, date').eq('user_id', userId);
      if (!error && data) {
        const grouped = data.reduce((acc: any, curr: any) => {
          if (!acc[curr.date]) acc[curr.date] = { total_sales: 0, total_expenses: 0, date: curr.date };
          if (curr.type === 'sale') acc[curr.date].total_sales += curr.amount;
          else acc[curr.date].total_expenses += curr.amount;
          return acc;
        }, {});
        
        return res.json(Object.values(grouped).sort((a: any, b: any) => a.date.localeCompare(b.date)));
      }
      if (error) {
        console.error("Supabase Stats Error:", JSON.stringify(error));
      }
    }
  
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
  } catch (err: any) {
    console.error("Stats API Error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

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
    res.status(500).json({ error: "Failed to verify RC number" });
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
    res.status(500).json({ error: "Failed to generate estimate" });
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
    res.status(500).json({ error: "Failed to generate insights" });
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
  const PORT = 3000;
  
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
