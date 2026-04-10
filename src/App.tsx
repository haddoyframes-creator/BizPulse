import React, { useState, useEffect, useRef } from 'react';
console.log("App component loading...");
import html2pdf from 'html2pdf.js';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle, 
  Plus,
  Search,
  Trash2,
  Download,
  Pencil,
  FileText, 
  Settings as SettingsIcon, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Camera,
  Upload,
  ChevronRight,
  PieChart as PieChartIcon,
  Scale,
  Lock,
  Zap,
  Cloud,
  CloudOff,
  Users,
  User as UserIcon,
  Phone,
  Mail,
  MapPin,
  Shield,
  AlertCircle,
  Printer,
  Brain,
  Sparkles
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { usePaystackPayment } from 'react-paystack';
import MonnifyButton from 'react-monnify-sdk';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Login from './components/Login';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Image compression utility
const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.5): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        console.log(`Compressed: ${(file.size / 1024).toFixed(1)}KB -> ${(Math.round((dataUrl.length * 3) / 4) / 1024).toFixed(1)}KB`);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, setDoc, addDoc, updateDoc, deleteDoc, orderBy, getDocFromServer, getDoc, getDocs } from 'firebase/firestore';
import { BusinessInfo, InventoryItem, Transaction, DailyStat, Customer, User } from './types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const recordBillingHistory = async (
  userId: string,
  amount: number,
  description: string,
  gateway: 'paystack' | 'monnify',
  reference: string
) => {
  try {
    await addDoc(collection(db, 'users', userId, 'billing_history'), {
      amount,
      description,
      date: new Date().toISOString(),
      status: 'success',
      gateway,
      reference
    });
  } catch (error) {
    console.error("Failed to record billing history:", error);
  }
};

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('bizpulse_token');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  console.log(`apiFetch: ${url}`);
  
  const userId = auth.currentUser?.uid;
  if (userId) {
    const method = options.method || 'GET';
    const path = url.split('?')[0];
    
    try {
      const checkPin = async () => {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists() && userDoc.data().hasPin) {
          const providedPin = headers.get('x-pin');
          if (userDoc.data().pin !== providedPin) {
            throw new Error('Invalid PIN');
          }
        }
      };

      if (path.startsWith('/api/inventory')) {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          await addDoc(collection(db, 'users', userId, 'inventory'), data);
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'PUT') {
          const id = path.split('/').pop()!;
          const data = JSON.parse(options.body as string);
          await updateDoc(doc(db, 'users', userId, 'inventory', id), data);
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'DELETE') {
          await checkPin();
          const id = path.split('/').pop()!;
          await deleteDoc(doc(db, 'users', userId, 'inventory', id));
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path.startsWith('/api/transactions')) {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          await addDoc(collection(db, 'users', userId, 'transactions'), data);
          
          // Update inventory stock
          if (data.product_id) {
            const qty = parseInt(data.quantity) || 1;
            const stockChange = data.type === 'sale' ? -qty : qty;
            const productRef = doc(db, 'users', userId, 'inventory', data.product_id.toString());
            const productDoc = await getDoc(productRef);
            if (productDoc.exists()) {
              await updateDoc(productRef, { stock: Number(productDoc.data().stock) + stockChange });
            }
          }
          
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'PUT') {
          const id = path.split('/').pop()!;
          const data = JSON.parse(options.body as string);
          
          // Revert old stock and apply new stock
          const transactionRef = doc(db, 'users', userId, 'transactions', id);
          const oldTxDoc = await getDoc(transactionRef);
          if (oldTxDoc.exists()) {
            const oldTx = oldTxDoc.data();
            if (oldTx.product_id) {
              const oldQty = parseInt(oldTx.quantity) || 1;
              const stockRevert = oldTx.type === 'sale' ? oldQty : -oldQty;
              const productRef = doc(db, 'users', userId, 'inventory', oldTx.product_id.toString());
              const productDoc = await getDoc(productRef);
              if (productDoc.exists()) {
                await updateDoc(productRef, { stock: Number(productDoc.data().stock) + stockRevert });
              }
            }
          }
          
          await updateDoc(transactionRef, data);
          
          if (data.product_id) {
            const qty = parseInt(data.quantity) || 1;
            const stockChange = data.type === 'sale' ? -qty : qty;
            const productRef = doc(db, 'users', userId, 'inventory', data.product_id.toString());
            const productDoc = await getDoc(productRef);
            if (productDoc.exists()) {
              await updateDoc(productRef, { stock: Number(productDoc.data().stock) + stockChange });
            }
          }
          
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'DELETE') {
          await checkPin();
          const id = path.split('/').pop()!;
          
          // Revert stock
          const transactionRef = doc(db, 'users', userId, 'transactions', id);
          const oldTxDoc = await getDoc(transactionRef);
          if (oldTxDoc.exists()) {
            const oldTx = oldTxDoc.data();
            if (oldTx.product_id) {
              const oldQty = parseInt(oldTx.quantity) || 1;
              const stockRevert = oldTx.type === 'sale' ? oldQty : -oldQty;
              const productRef = doc(db, 'users', userId, 'inventory', oldTx.product_id.toString());
              const productDoc = await getDoc(productRef);
              if (productDoc.exists()) {
                await updateDoc(productRef, { stock: Number(productDoc.data().stock) + stockRevert });
              }
            }
          }
          
          await deleteDoc(transactionRef);
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path.startsWith('/api/customers')) {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          delete data.id;
          await addDoc(collection(db, 'users', userId, 'customers'), data);
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'PUT') {
          const id = path.split('/').pop()!;
          const data = JSON.parse(options.body as string);
          delete data.id;
          await updateDoc(doc(db, 'users', userId, 'customers', id), data);
          return new Response(JSON.stringify({ success: true }));
        } else if (method === 'DELETE') {
          await checkPin();
          const id = path.split('/').pop()!;
          await deleteDoc(doc(db, 'users', userId, 'customers', id));
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path === '/api/business') {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          await setDoc(doc(db, 'users', userId, 'business_info', 'info'), data, { merge: true });
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path === '/api/auth/set-pin') {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          await updateDoc(doc(db, 'users', userId), { hasPin: true, pin: data.pin });
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path === '/api/subscription/upgrade') {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          await updateDoc(doc(db, 'users', userId), { subscription_tier: data.tier });
          return new Response(JSON.stringify({ success: true }));
        }
      } else if (path === '/api/subscription/promo') {
        if (method === 'POST') {
          const data = JSON.parse(options.body as string);
          if (data.code === 'PROMO') {
            await updateDoc(doc(db, 'users', userId), { subscription_tier: 'pro' });
            return new Response(JSON.stringify({ success: true }));
          } else {
            return new Response(JSON.stringify({ error: 'Invalid code' }), { status: 400 });
          }
        }
      } else if (path.startsWith('/api/ai/')) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "Gemini API key is missing or invalid. Please add VITE_GEMINI_API_KEY to your environment variables." }), { status: 400 });
        }
        
        const callGemini = async (prompt: string, useSearch: boolean = false) => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
          const payload: any = {
            contents: [{ parts: [{ text: prompt }] }]
          };
          
          if (useSearch) {
            payload.tools = [{ googleSearch: {} }];
          }
          
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Gemini API Error: ${res.status}`);
          }
          
          const data = await res.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        };

        if (path === '/api/ai/verify-rc') {
          const { rcNumber } = JSON.parse(options.body as string);
          try {
            const prompt = `You are a corporate registry assistant. Your task is to find the exact company details for a Nigerian company registered with the Corporate Affairs Commission (CAC) using its RC number (Registration Number).
              The RC number to search for is: ${rcNumber}.
              Use Google Search to find the official company name, registered address, and primary business activity. Search specifically for "RC ${rcNumber} Nigeria" or look up CAC directories.
              It is CRITICAL that you return the exact company name associated with this specific RC number. Do not guess or return a similar company. If you are not 100% sure, return "NOT_FOUND" for the name.
              Return ONLY a raw JSON object with the following keys:
              - "name": The full official registered company name (or "NOT_FOUND" if you cannot find a definitive match for this exact RC number)
              - "address": The registered office address (or empty string if not found)
              - "activity": The primary nature of business or activity (or empty string if not found)
              Do not include any markdown formatting or backticks.`;
              
            const text = await callGemini(prompt, true);

            let data;
            try {
              const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
              data = JSON.parse(cleanText);
            } catch (e) {
              const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
              const addressMatch = text.match(/"address"\s*:\s*"([^"]+)"/);
              const activityMatch = text.match(/"activity"\s*:\s*"([^"]+)"/);
              
              data = {
                name: nameMatch ? nameMatch[1] : "NOT_FOUND",
                address: addressMatch ? addressMatch[1] : "",
                activity: activityMatch ? activityMatch[1] : ""
              };
            }
            return new Response(JSON.stringify(data));
          } catch (error: any) {
            console.error("AI Error:", error);
            return new Response(JSON.stringify({ error: error.message || "Failed to verify RC number" }), { status: 500 });
          }
        } else if (path === '/api/ai/generate-tax-estimate') {
          const { taxType, year, businessType, annualTurnover, annualProfit, monthlySales, employees, avgSalary, state } = JSON.parse(options.body as string);
          
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
            const text = await callGemini(prompt);
            return new Response(JSON.stringify({ estimate: text }));
          } catch (error: any) {
            console.error("AI Error:", error);
            return new Response(JSON.stringify({ error: error.message || "Failed to generate estimate" }), { status: 500 });
          }
        } else if (path === '/api/ai/business-insights') {
          const { businessName, transactions, customQuestion } = JSON.parse(options.body as string);
          
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
            const text = await callGemini(prompt);
            return new Response(JSON.stringify({ insights: text }));
          } catch (error: any) {
            console.error("AI Error:", error);
            return new Response(JSON.stringify({ error: error.message || "Failed to generate insights" }), { status: 500 });
          }
        }
      }
    } catch (e: any) {
      console.error('Firestore intercept error:', e);
      if (e.message === 'Invalid PIN') {
        return new Response(JSON.stringify({ error: 'Invalid PIN' }), { status: 403 });
      }
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  }

  try {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const fullUrl = url.startsWith('/api') ? `${baseUrl}${url}` : url;
    const res = await fetch(fullUrl, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      console.warn(`apiFetch: Auth failed for ${url}`);
      localStorage.removeItem('bizpulse_token');
      window.location.reload();
      throw new Error('Authentication failed');
    }
    return res;
  } catch (error) {
    console.error(`apiFetch error for ${url}:`, error);
    throw error;
  }
};

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('bizpulse_token'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('bizpulse_token', token);
    } else {
      localStorage.removeItem('bizpulse_token');
    }
  }, [token]);

  useEffect(() => {
    console.log("App component mounted");
  }, []);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'transactions' | 'customers' | 'reports' | 'tax' | 'subscription' | 'settings' | 'admin' | 'ai-advisor'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetchData();
    // Safety timeout to ensure loading screen doesn't get stuck
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);

  const fetchData = async () => {
    // fetchData is now handled by Firebase onSnapshot listeners
  };

  const unsubscribersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    let unsubBusiness: (() => void) | undefined;
    let unsubInventory: (() => void) | undefined;
    let unsubCustomers: (() => void) | undefined;
    let unsubTransactions: (() => void) | undefined;

    const clearListeners = () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
      if (unsubUser) unsubUser();
      if (unsubBusiness) unsubBusiness();
      if (unsubInventory) unsubInventory();
      if (unsubCustomers) unsubCustomers();
      if (unsubTransactions) unsubTransactions();
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous listeners if they exist
      clearListeners();

      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        setToken(token);
        
        const userId = firebaseUser.uid;
        
        // Listen to User
        unsubUser = onSnapshot(doc(db, 'users', userId), (docSnap) => {
          if (docSnap.exists()) {
            setUser({ 
              id: userId as any, 
              ...docSnap.data(),
              email: firebaseUser.email || docSnap.data()?.email || ''
            } as User);
          } else {
            // Create default user doc
            const defaultUser = { email: firebaseUser.email, hasPin: false, subscription_tier: 'free', subscription_status: 'active' };
            setDoc(doc(db, 'users', userId), defaultUser);
            setUser({ id: userId as any, ...defaultUser } as User);
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, `users/${userId}`));
        unsubscribersRef.current.push(unsubUser);

        // Listen to Business Info
        unsubBusiness = onSnapshot(doc(db, 'users', userId, 'business_info', 'info'), (docSnap) => {
          if (docSnap.exists()) {
            setBusiness({ id: 'info' as any, ...docSnap.data() } as BusinessInfo);
          } else {
            setBusiness(null);
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, `users/${userId}/business_info/info`));
        unsubscribersRef.current.push(unsubBusiness);

        // Listen to Inventory
        unsubInventory = onSnapshot(collection(db, 'users', userId, 'inventory'), (snapshot) => {
          const items = snapshot.docs.map(doc => ({ id: doc.id as any, ...doc.data() } as InventoryItem));
          setInventory(items);
        }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/inventory`));
        unsubscribersRef.current.push(unsubInventory);

        // Listen to Customers
        unsubCustomers = onSnapshot(collection(db, 'users', userId, 'customers'), (snapshot) => {
          const items = snapshot.docs.map(doc => ({ id: doc.id as any, ...doc.data() } as Customer));
          setCustomers(items);
        }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/customers`));
        unsubscribersRef.current.push(unsubCustomers);

        // Listen to Transactions
        unsubTransactions = onSnapshot(collection(db, 'users', userId, 'transactions'), (snapshot) => {
          const items = snapshot.docs.map(doc => ({ id: doc.id as any, ...doc.data() } as Transaction));
          setTransactions(items);
          
          // Calculate stats
          const statsMap = new Map<string, DailyStat>();
          items.forEach(t => {
            const date = t.date.split('T')[0];
            if (!statsMap.has(date)) {
              statsMap.set(date, { date, total_sales: 0, total_expenses: 0 });
            }
            const stat = statsMap.get(date)!;
            if (t.type === 'sale') stat.total_sales += t.amount;
            else stat.total_expenses += t.amount;
          });
          setStats(Array.from(statsMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
          
          setLoading(false);
        }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${userId}/transactions`));
        unsubscribersRef.current.push(unsubTransactions);

      } else {
        setToken(null);
        setUser(null);
        setBusiness(null);
        setInventory([]);
        setTransactions([]);
        setCustomers([]);
        setStats([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      clearListeners();
    };
  }, []);

  const handleLogout = async () => {
    unsubscribersRef.current.forEach(unsub => unsub());
    unsubscribersRef.current = [];
    await signOut(auth);
    setToken(null);
  };

  if (!token) {
    return <Login onLogin={setToken} />;
  }

  const renderContent = () => {
    const tier = user?.subscription_tier || 'free';

    switch (activeTab) {
      case 'dashboard': return <Dashboard stats={stats} transactions={transactions} />;
      case 'admin': return <AdminDashboard user={user} />;
      case 'inventory': return <Inventory user={user} inventory={inventory} onUpdate={fetchData} />;
      case 'transactions': return <Transactions user={user} transactions={transactions} inventory={inventory} customers={customers} onUpdate={fetchData} />;
      case 'customers': return <Customers customers={customers} onUpdate={fetchData} />;
      case 'reports': 
        if (tier === 'basic' || tier === 'pro') {
          return <CACAnnualReport user={user} transactions={transactions} business={business} />;
        }
        return <SubscriptionGate 
          title="CAC Annual Report" 
          description="Generate your provisional CAC Annual Return document with auto-calculated financials." 
          requiredTier="basic"
          onUpgrade={() => setActiveTab('subscription')}
        />;
      case 'tax': 
        if (tier === 'basic' || tier === 'pro') {
          return <TaxEstimator user={user} transactions={transactions} business={business} />;
        }
        return <SubscriptionGate 
          title="Tax Expert" 
          description="Estimate your annual taxes according to Nigerian tax laws and get filing guidance." 
          requiredTier="basic"
          onUpgrade={() => setActiveTab('subscription')}
        />;
      case 'ai-advisor':
        if (tier === 'basic' || tier === 'pro') {
          return <AIAdvisorView user={user} transactions={transactions} business={business} />;
        }
        return <SubscriptionGate 
          title="AI Business Advisor" 
          description="Get personalized business insights and recommendations based on your transaction history." 
          requiredTier="basic"
          onUpgrade={() => setActiveTab('subscription')}
        />;
      case 'subscription': return <Subscription user={user} business={business} onUpdate={fetchData} />;
      case 'settings': return <SettingsView user={user} business={business} onUpdate={fetchData} onNavigate={setActiveTab} />;
      default: return <Dashboard stats={stats} transactions={transactions} />;
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-stone-50">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
      />
    </div>
  );

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 font-sans">
      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-stone-200 flex flex-col transition-all duration-300 ease-in-out relative",
        isSidebarCollapsed ? "w-20" : "w-64"
      )}>
        {/* Collapse Toggle Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-24 bg-white border border-stone-200 rounded-full p-1 text-stone-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm z-20 transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronRight size={16} className="rotate-180" />}
        </button>

        <div className={cn(
          "p-6 flex items-center gap-3 border-b border-stone-100 overflow-hidden whitespace-nowrap",
          isSidebarCollapsed && "justify-center px-0"
        )}>
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex-shrink-0 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            {business?.logo_url ? (
              <img src={business.logo_url} alt="Logo" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
            ) : (
              <TrendingUp size={24} />
            )}
          </div>
          {!isSidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden"
            >
              <h1 className="font-bold text-lg tracking-tight leading-none truncate">{business?.name || 'BizPulse'}</h1>
              <span className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Business Tracker</span>
            </motion.div>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto overflow-x-hidden">
          <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<Package size={20} />} label="Inventory" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<PlusCircle size={20} />} label="Transactions" active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<Users size={20} />} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<FileText size={20} />} label="CAC Report" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<Scale size={20} />} label="Tax Expert" active={activeTab === 'tax'} onClick={() => setActiveTab('tax')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<Brain size={20} />} label="AI Advisor" active={activeTab === 'ai-advisor'} onClick={() => setActiveTab('ai-advisor')} collapsed={isSidebarCollapsed} />
          <NavItem icon={<Zap size={20} />} label="Subscription" active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} collapsed={isSidebarCollapsed} />
          {(user?.role === 'admin' || user?.email?.toLowerCase() === 'haddoyframes@gmail.com') && (
            <NavItem icon={<Shield size={20} />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} collapsed={isSidebarCollapsed} />
          )}
          <NavItem icon={<SettingsIcon size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={isSidebarCollapsed} />
        </nav>

        <div className={cn(
          "p-6 border-t border-stone-100 space-y-4",
          isSidebarCollapsed && "px-2"
        )}>
          {!isSidebarCollapsed && (
            <div className="bg-stone-50 rounded-2xl p-4">
              <p className="text-xs text-stone-500 font-medium mb-1 truncate" title={user?.email || 'No email'}>
                {user?.email || 'Loading...'}
              </p>
              <p className="text-[10px] text-stone-400">Logged in as {user?.role || 'user'}</p>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors",
              isSidebarCollapsed ? "justify-center px-0" : "justify-center"
            )}
            title={isSidebarCollapsed ? "Log Out" : undefined}
          >
            <Lock size={18} />
            {!isSidebarCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-stone-200 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold capitalize">{activeTab}</h2>
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
              isOnline ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"
            )}>
              {isOnline ? <Cloud size={12} /> : <CloudOff size={12} />}
              {isOnline ? "Cloud Synced" : "Offline Mode"}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isSyncing && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full"
              />
            )}
            <div className="text-right">
              <p className="text-xs text-stone-400 font-medium">{format(new Date(), 'EEEE, MMMM do')}</p>
              <p className="text-sm font-bold text-emerald-600">Active Session</p>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel, isLoading, confirmText = "Delete", type = "danger" }: { 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onCancel: () => void, 
  isLoading?: boolean,
  confirmText?: string,
  type?: "danger" | "success"
}) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
      >
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
          type === 'danger' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
        )}>
          {type === 'danger' ? <Trash2 size={32} /> : <Plus size={32} />}
        </div>
        <h3 className="text-xl font-bold text-center mb-2">{title}</h3>
        <p className="text-stone-500 text-sm text-center mb-8">{message}</p>
        
        <div className="flex gap-4">
          <button 
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="flex-1 py-4 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "flex-1 text-white py-4 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2",
              type === 'danger' ? "bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100" : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
            )}
          >
            {isLoading ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
              />
            ) : confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PinPrompt({ onConfirm, onCancel, isLoading, title = "Authorize Deletion" }: { onConfirm: (pin: string) => void, onCancel: () => void, isLoading?: boolean, title?: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    onConfirm(pin);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
      >
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mx-auto mb-6">
          <Lock size={32} />
        </div>
        <h3 className="text-xl font-bold text-center mb-2">{title}</h3>
        <p className="text-stone-500 text-sm text-center mb-8">Please enter your security PIN to authorize this action.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input 
              type="password"
              autoFocus
              disabled={isLoading}
              placeholder="Enter PIN"
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-6 py-4 text-center text-2xl font-bold tracking-[1em] focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50"
              value={pin}
              onChange={e => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
            />
            {error && <p className="text-rose-500 text-xs mt-2 text-center font-bold">{error}</p>}
          </div>
          
          <div className="flex gap-4">
            <button 
              type="button"
              disabled={isLoading}
              onClick={onCancel}
              className="flex-1 py-4 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-rose-600 text-white py-4 rounded-xl font-bold hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
              ) : 'Confirm'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
        active 
          ? "bg-emerald-50 text-emerald-700 shadow-sm" 
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-900",
        collapsed && "justify-center px-0"
      )}
    >
      <span className={cn("transition-transform duration-200 flex-shrink-0", active ? "scale-110" : "group-hover:scale-110")}>{icon}</span>
      {!collapsed && (
        <motion.span 
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-medium text-sm whitespace-nowrap overflow-hidden"
        >
          {label}
        </motion.span>
      )}
      {active && !collapsed && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 bg-emerald-500 rounded-full flex-shrink-0" />}
      {active && collapsed && <div className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full" />}
    </button>
  );
}

// --- Dashboard Component ---
function AdminDashboard({ user }: { user: User | null }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserBusiness, setSelectedUserBusiness] = useState<BusinessInfo | null>(null);
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user || (user.role !== 'admin' && user.email?.toLowerCase() !== 'haddoyframes@gmail.com')) return;
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersList: User[] = [];
        querySnapshot.forEach((doc: any) => {
          usersList.push({ id: doc.id, ...doc.data() } as User);
        });
        setUsers(usersList);
      } catch (err: any) {
        console.error("Error fetching users:", err);
        setError(err.message || "Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [user]);

  if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  const totalUsers = users.length;
  const proUsers = users.filter(u => u.subscription_tier === 'pro').length;
  const basicUsers = users.filter(u => u.subscription_tier === 'basic').length;

  const handleUpdateUser = async (userId: string, field: string, value: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { [field]: value });
      setUsers(users.map(u => u.id === userId ? { ...u, [field]: value } : u));
    } catch (err: any) {
      alert("Failed to update user: " + err.message);
    }
  };

  const viewUserDetails = async (userId: string) => {
    setIsFetchingDetails(true);
    setIsViewingDetails(true);
    try {
      const docRef = doc(db, 'users', userId, 'business_info', 'info');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSelectedUserBusiness({ id: docSnap.id, ...docSnap.data() } as BusinessInfo);
      } else {
        setSelectedUserBusiness(null);
      }
    } catch (err) {
      console.error("Error fetching user business details:", err);
      alert("Failed to load business details");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-stone-500 mt-1">Platform overview and user management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-sm font-medium text-stone-500">Total Users</p>
          <p className="text-3xl font-bold mt-2">{totalUsers}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-sm font-medium text-stone-500">Pro Subscriptions</p>
          <p className="text-3xl font-bold mt-2 text-emerald-600">{proUsers}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-sm font-medium text-stone-500">Basic Subscriptions</p>
          <p className="text-3xl font-bold mt-2 text-blue-600">{basicUsers}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100">
          <h2 className="text-lg font-bold">All Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500 font-medium">
              <tr>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Tier</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4 font-medium">{u.email}</td>
                  <td className="px-6 py-4">
                    <select 
                      value={u.subscription_tier} 
                      onChange={(e) => handleUpdateUser(u.id, 'subscription_tier', e.target.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium capitalize border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500",
                        u.subscription_tier === 'pro' ? "bg-emerald-100 text-emerald-700" :
                        u.subscription_tier === 'basic' ? "bg-blue-100 text-blue-700" :
                        "bg-stone-100 text-stone-700"
                      )}
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={u.subscription_status} 
                      onChange={(e) => handleUpdateUser(u.id, 'subscription_status', e.target.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium capitalize border-0 bg-stone-100 text-stone-700 cursor-pointer focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="pending">Pending</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={u.role || 'user'} 
                      onChange={(e) => handleUpdateUser(u.id, 'role', e.target.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium capitalize border-0 bg-stone-100 text-stone-700 cursor-pointer focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => viewUserDetails(u.id)}
                      className="text-emerald-600 hover:text-emerald-700 font-bold text-xs uppercase tracking-wider"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-stone-500">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isViewingDetails && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold">User Business Profile</h3>
              <button onClick={() => setIsViewingDetails(false)} className="text-stone-400 hover:text-stone-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            {isFetchingDetails ? (
              <div className="py-20 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              </div>
            ) : selectedUserBusiness ? (
              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-stone-100 rounded-3xl overflow-hidden border border-stone-200">
                    {selectedUserBusiness.logo_url ? (
                      <img src={selectedUserBusiness.logo_url} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-300"><Upload size={32} /></div>
                    )}
                  </div>
                  <div className="w-24 h-24 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                    {selectedUserBusiness.user_photo_url ? (
                      <img src={selectedUserBusiness.user_photo_url} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-300"><UserIcon size={32} /></div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-stone-900">{selectedUserBusiness.name}</h4>
                    <p className="text-stone-500">{selectedUserBusiness.phone_number || 'No phone number'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Email Address</p>
                    <p className="text-sm font-medium">{selectedUserBusiness.email_address || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">RC / BN Number</p>
                    <p className="text-sm font-medium">{selectedUserBusiness.rc_number || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Business Address</p>
                    <p className="text-sm font-medium">{selectedUserBusiness.address || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Nature of Business</p>
                    <p className="text-sm font-medium">{selectedUserBusiness.nature_of_business || 'N/A'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-stone-500">
                <p>No business profile information found for this user.</p>
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-stone-100">
              <button 
                onClick={() => setIsViewingDetails(false)}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all"
              >
                Close Details
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ stats, transactions }: { stats: DailyStat[], transactions: Transaction[] }) {
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year' | 'lifetime'>('week');
  
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (viewMode) {
    case 'week':
      start = startOfWeek(now);
      end = endOfWeek(now);
      break;
    case 'month':
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case 'year':
      start = startOfYear(now);
      end = endOfYear(now);
      break;
    default:
      start = new Date(0);
      end = new Date(8640000000000000);
  }

  const filteredTransactions = viewMode === 'lifetime' 
    ? transactions
    : transactions.filter(t => {
        try {
          const d = parseISO(t.date);
          return isWithinInterval(d, { start, end });
        } catch (e) {
          return false;
        }
      });

  const filteredStats = viewMode === 'lifetime'
    ? stats
    : stats.filter(s => {
        try {
          const d = parseISO(s.date);
          return isWithinInterval(d, { start, end });
        } catch (e) {
          return false;
        }
      });

  // Prepare chart data based on view mode
  let chartData = filteredStats;
  if (viewMode === 'year' || viewMode === 'lifetime') {
    // Group by month for year/lifetime views to avoid overcrowding
    const monthlyGroups = filteredStats.reduce((acc, s) => {
      const monthKey = format(parseISO(s.date), 'yyyy-MM');
      if (!acc[monthKey]) {
        acc[monthKey] = { 
          date: monthKey, 
          displayDate: format(parseISO(s.date), 'MMM yyyy'),
          total_sales: 0, 
          total_expenses: 0 
        };
      }
      acc[monthKey].total_sales += s.total_sales;
      acc[monthKey].total_expenses += s.total_expenses;
      return acc;
    }, {} as Record<string, any>);
    
    chartData = Object.values(monthlyGroups).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // For week/month, just sort by date
    chartData = [...filteredStats].sort((a, b) => a.date.localeCompare(b.date));
  }

  const totalSales = filteredTransactions.filter(t => t.type === 'sale').reduce((acc, t) => acc + t.amount, 0);
  const totalExpenses = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const profit = totalSales - totalExpenses;

  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold">Business Overview</h3>
          <p className="text-stone-400 text-sm">Performance tracking for {viewMode === 'week' ? 'this week' : viewMode === 'month' ? 'this month' : viewMode === 'year' ? 'this year' : 'all time'}</p>
        </div>
        <div className="flex p-1 bg-white border border-stone-200 rounded-2xl shadow-sm overflow-x-auto">
          {(['week', 'month', 'year', 'lifetime'] as const).map((mode) => (
            <button 
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                viewMode === mode ? "bg-emerald-600 text-white shadow-md" : "text-stone-500 hover:text-stone-900"
              )}
            >
              {mode === 'week' ? 'Weekly' : mode === 'month' ? 'Monthly' : mode === 'year' ? 'Yearly' : 'Lifetime'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Revenue" 
          value={totalSales} 
          icon={<TrendingUp className="text-emerald-500" />} 
          trend={viewMode === 'week' ? "This Week" : viewMode === 'month' ? "This Month" : viewMode === 'year' ? "This Year" : "All-time"} 
        />
        <StatCard 
          title="Expenses" 
          value={totalExpenses} 
          icon={<TrendingDown className="text-rose-500" />} 
          trend={viewMode === 'week' ? "This Week" : viewMode === 'month' ? "This Month" : viewMode === 'year' ? "This Year" : "All-time"} 
        />
        <StatCard 
          title="Net Profit" 
          value={profit} 
          icon={<DollarSign className="text-blue-500" />} 
          trend={viewMode === 'week' ? "This Week" : viewMode === 'month' ? "This Month" : viewMode === 'year' ? "This Year" : "All-time"} 
          highlight 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart Section */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-lg">{viewMode === 'year' || viewMode === 'lifetime' ? 'Monthly' : 'Daily'} Performance</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-stone-400">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" /> Sales
              <div className="w-2 h-2 bg-rose-500 rounded-full ml-2" /> Expenses
            </div>
          </div>
          <div className="h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey={viewMode === 'year' || viewMode === 'lifetime' ? 'displayDate' : 'date'} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a8a29e' }}
                    tickFormatter={(str) => {
                      if (viewMode === 'year' || viewMode === 'lifetime') return str.split(' ')[0];
                      try {
                        return format(parseISO(str), 'MMM d');
                      } catch (e) {
                        return str;
                      }
                    }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a8a29e' }}
                    tickFormatter={(val) => `₦${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: number) => [`₦${val.toLocaleString()}`, '']}
                  />
                  <Bar dataKey="total_sales" fill="#10b981" radius={[4, 4, 0, 0]} name="Sales" />
                  <Bar dataKey="total_expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-stone-400 text-sm italic">
                No data to display yet
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-lg">Recent Transactions</h3>
            <ChevronRight className="text-stone-400" size={20} />
          </div>
          <div className="space-y-4">
            {recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-transparent hover:border-stone-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    t.type === 'sale' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                  )}>
                    {t.type === 'sale' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{t.item_name || t.category || (t.type === 'sale' ? 'Product Sale' : 'Expense')}</p>
                    <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">{t.date}</p>
                  </div>
                </div>
                <p className={cn("font-bold", t.type === 'sale' ? "text-emerald-600" : "text-rose-600")}>
                  {t.type === 'sale' ? '+' : '-'}₦{t.amount.toLocaleString()}
                </p>
              </div>
            ))}
            {recentTransactions.length === 0 && (
              <div className="text-center py-12 text-stone-400">
                <p>No transactions yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, highlight }: { title: string, value: number, icon: React.ReactNode, trend: string, highlight?: boolean }) {
  return (
    <div className={cn(
      "p-8 rounded-3xl border shadow-sm transition-all hover:shadow-md",
      highlight ? "bg-emerald-900 text-white border-emerald-800" : "bg-white border-stone-200"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-3 rounded-2xl", highlight ? "bg-emerald-800" : "bg-stone-50")}>
          {icon}
        </div>
        <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", highlight ? "bg-emerald-800 text-emerald-300" : "bg-emerald-50 text-emerald-600")}>
          {trend}
        </span>
      </div>
      <p className={cn("text-sm font-medium mb-1", highlight ? "text-emerald-200" : "text-stone-400")}>{title}</p>
      <h4 className="text-3xl font-bold tracking-tight">₦{value.toLocaleString()}</h4>
    </div>
  );
}

// --- Inventory Component ---
function Inventory({ user, inventory, onUpdate }: { user: User | null, inventory: InventoryItem[], onUpdate: () => Promise<void> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [newItem, setNewItem] = useState<{name: string, description: string, price: string, stock: string, size: string, vat_status: 'vatable' | 'exempt' | 'zero_rated'}>({ name: '', description: '', price: '', stock: '', size: '', vat_status: 'vatable' });
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [submittingType, setSubmittingType] = useState<'save' | 'add-another' | 'delete' | null>(null);

  useEffect(() => {
    if (editingItem) {
      setNewItem({
        name: editingItem.name,
        description: editingItem.description || '',
        price: editingItem.price.toString(),
        stock: editingItem.stock.toString(),
        size: editingItem.size || '',
        vat_status: editingItem.vat_status || 'vatable'
      });
      setShowAdd(true);
    }
  }, [editingItem]);

  const handleDelete = async (id: string, pin?: string) => {
    if (user?.hasPin && !pin) {
      setShowPinPrompt(id);
      return;
    }

    if (!pin && !confirmDelete) {
      setConfirmDelete(id);
      return;
    }
    
    setIsSubmitting(true);
    setSubmittingType('delete');
    try {
      const res = await apiFetch(`/api/inventory/${id}`, { 
        method: 'DELETE',
        headers: pin ? { 'x-pin': pin } : {}
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete product");
      }
      setShowPinPrompt(null);
      await onUpdate();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
      setSubmittingType(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent, type: 'save' | 'add-another' = 'save') => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Basic validation for manual trigger
    if (!newItem.name || !newItem.price || !newItem.stock) {
      alert("Please fill in all required fields (Name, Price, and Stock)");
      return;
    }

    setIsSubmitting(true);
    setSubmittingType(type);
    try {
      let photo_url = editingItem ? (editingItem.photo_url || null) : null;

      if (file) {
        try {
          setIsCompressing(true);
          const dataUrl = await compressImage(file);
          photo_url = dataUrl;
        } catch (err) {
          console.error("Upload failed", err);
        } finally {
          setIsCompressing(false);
        }
      }

      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error("User not authenticated");

      const itemData = {
        name: newItem.name,
        description: newItem.description || null,
        price: Number(newItem.price),
        stock: Number(newItem.stock),
        size: newItem.size || null,
        vat_status: newItem.vat_status,
        photo_url
      };

      if (editingItem) {
        await updateDoc(doc(db, 'users', userId, 'inventory', editingItem.id.toString()), itemData);
      } else {
        await addDoc(collection(db, 'users', userId, 'inventory'), itemData);
      }

      setNewItem({ name: '', description: '', price: '', stock: '', size: '', vat_status: 'vatable' });
      setFile(null);
      setEditingItem(null);
      
      if (type === 'save') {
        setShowAdd(false);
      }
      
      await onUpdate();
    } catch (error: any) {
      console.error("Save error:", error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
      setSubmittingType(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Product Catalog</h3>
          <p className="text-stone-400 text-sm">Manage your business stock and pricing</p>
        </div>
        <button 
          onClick={() => {
            setEditingItem(null);
            setNewItem({ name: '', description: '', price: '', stock: '', size: '', vat_status: 'vatable' });
            setShowAdd(!showAdd);
          }}
          className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
        >
          <PlusCircle size={18} />
          {showAdd ? 'Close Form' : 'Add Product'}
        </button>
      </div>

      {showAdd && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm"
        >
          <h4 className="font-bold text-lg mb-6">{editingItem ? 'Edit Product' : 'New Product'}</h4>
          <form onSubmit={(e) => handleSubmit(e, 'save')} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Product Name</label>
                <input 
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Description</label>
                <textarea 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24"
                  value={newItem.description}
                  onChange={e => setNewItem({...newItem, description: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Price (₦)</label>
                  <input 
                    required type="number"
                    min="0"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    value={newItem.price}
                    onChange={e => setNewItem({...newItem, price: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Initial Stock</label>
                  <input 
                    required type="number"
                    min="0"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    value={newItem.stock}
                    onChange={e => setNewItem({...newItem, stock: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Size (Optional)</label>
                  <input 
                    placeholder="e.g. XL, 42, 500ml"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    value={newItem.size}
                    onChange={e => setNewItem({...newItem, size: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">VAT Status</label>
                  <select 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    value={newItem.vat_status}
                    onChange={e => setNewItem({...newItem, vat_status: e.target.value as any})}
                  >
                    <option value="vatable">VATable (7.5%)</option>
                    <option value="exempt">Exempt (0%)</option>
                    <option value="zero_rated">Zero-Rated (0%)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Product Photo</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full bg-stone-50 border-2 border-dashed border-stone-200 rounded-xl p-8 flex flex-col items-center justify-center text-stone-400 group-hover:border-emerald-500 group-hover:bg-emerald-50 transition-all">
                    <Camera size={32} className="mb-2" />
                    <p className="text-sm font-medium">{file ? file.name : 'Tap to take photo or upload'}</p>
                    <p className="text-[10px] mt-1 opacity-60">Optimized for low-memory phones</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-4">
                <button 
                  type="submit" 
                  disabled={isSubmitting || isCompressing}
                  className={cn(
                    "flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all",
                    (isSubmitting || isCompressing) ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-700 shadow-lg shadow-emerald-100"
                  )}
                >
                  {isCompressing ? 'Optimizing Photo...' : submittingType === 'save' ? 'Saving...' : (editingItem ? 'Update Product' : 'Save Product')}
                </button>
                {!editingItem && (
                  <button 
                    type="button"
                    disabled={isSubmitting || isCompressing}
                    onClick={(e) => handleSubmit(e, 'add-another')}
                    className={cn(
                      "flex-1 bg-emerald-50 text-emerald-600 border border-emerald-200 py-3 rounded-xl font-bold transition-all",
                      (isSubmitting || isCompressing) ? "opacity-50 cursor-not-allowed" : "hover:bg-emerald-100"
                    )}
                  >
                    {isCompressing ? 'Optimizing...' : submittingType === 'add-another' ? 'Saving...' : 'Save & Add Another'}
                  </button>
                )}
                <button 
                  type="button" 
                  disabled={isSubmitting}
                  onClick={() => {
                    setShowAdd(false);
                    setEditingItem(null);
                    setNewItem({ name: '', description: '', price: '', stock: '', size: '', vat_status: 'vatable' });
                  }} 
                  className="px-6 py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {inventory.map(item => (
          <div key={item.id} className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
            <div className="h-48 bg-stone-100 relative overflow-hidden">
              {item.photo_url ? (
                <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-300">
                  <Package size={48} />
                </div>
              )}
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-emerald-600 shadow-sm">
                In Stock: {item.stock}
              </div>
            </div>
            <div className="p-6">
              <h4 className="font-bold text-lg mb-1">{item.name} {item.size && <span className="text-sm font-normal text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full ml-2">{item.size}</span>}</h4>
              <p className="text-stone-400 text-xs mb-4 line-clamp-2">{item.description || 'No description provided.'}</p>
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-stone-900">₦{item.price.toLocaleString()}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingItem(item);
                      setNewItem({
                        name: item.name,
                        description: item.description || '',
                        price: item.price.toString(),
                        stock: item.stock.toString(),
                        size: item.size || '',
                        vat_status: item.vat_status || 'vatable'
                      });
                      setShowAdd(true);
                    }}
                    title="Edit Item"
                    className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                  >
                    <Pencil size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showPinPrompt && (
        <PinPrompt 
          onConfirm={(pin) => handleDelete(showPinPrompt, pin)}
          onCancel={() => setShowPinPrompt(null)}
          isLoading={isSubmitting && submittingType === 'delete'}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog 
          title="Delete Item?"
          message="Are you sure you want to delete this item from inventory? This action cannot be undone."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          isLoading={isSubmitting && submittingType === 'delete'}
        />
      )}
    </div>
  );
}

// --- Transactions Component ---
function Transactions({ user, transactions, inventory, customers, onUpdate }: { user: User | null, transactions: Transaction[], inventory: InventoryItem[], customers: Customer[], onUpdate: () => Promise<void> }) {
  const [type, setType] = useState<'sale' | 'expense'>('sale');
  const [amount, setAmount] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vatStatus, setVatStatus] = useState<'vatable' | 'exempt' | 'zero_rated'>('vatable');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [entryMode, setEntryMode] = useState<'product' | 'manual'>('product');
  
  // Cart state for multiple items
  const [cart, setCart] = useState<Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    vatStatus: 'vatable' | 'exempt' | 'zero_rated';
  }>>([]);

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id);
    setType(t.type);
    setAmount(t.amount.toString());
    const qty = t.quantity || 1;
    setQuantity(qty.toString());
    setUnitPrice((t.amount / qty).toString());
    setCategory(t.category || '');
    setProductId(t.product_id ? t.product_id.toString() : '');
    setEntryMode(t.product_id ? 'product' : 'manual');
    setItemName(t.item_name || (t.product_id ? '' : t.category || '')); // Fallback for item name
    setCustomerId(t.customer_id ? t.customer_id.toString() : '');
    setDescription(t.description || '');
    setDate(t.date);
    setVatStatus(t.vat_status || 'vatable');
    setCart([]); // Clear cart when editing a single transaction
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, pin?: string) => {
    if (user?.hasPin && !pin) {
      setShowPinPrompt(id);
      return;
    }

    if (!pin && !confirmDelete) {
      setConfirmDelete(id);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/transactions/${id}`, { 
        method: 'DELETE',
        headers: pin ? { 'x-pin': pin } : {}
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete transaction");
      }
      setShowPinPrompt(null);
      await onUpdate();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick stats for the transactions page
  const today = new Date().toISOString().split('T')[0];
  const todaySales = transactions.filter(t => t.date === today && t.type === 'sale').reduce((a, b) => a + b.amount, 0);
  const todayExpenses = transactions.filter(t => t.date === today && t.type === 'expense').reduce((a, b) => a + b.amount, 0);

  // Auto-calculate unit price when product changes
  useEffect(() => {
    if (entryMode === 'product' && productId && !editingId) {
      const product = inventory.find(p => p.id.toString() === productId);
      if (product) {
        setUnitPrice(product.price.toString());
        setVatStatus(product.vat_status || 'vatable');
      }
    }
  }, [productId, inventory, entryMode, editingId]);

  // Auto-calculate total amount when unit price or quantity changes
  useEffect(() => {
    const up = parseFloat(unitPrice);
    const qty = parseInt(quantity);
    if (!isNaN(up) && !isNaN(qty)) {
      setAmount((up * qty).toString());
    }
  }, [unitPrice, quantity]);

  const addToCart = () => {
    const up = parseFloat(unitPrice);
    const qty = parseInt(quantity);
    
    if (isNaN(up) || isNaN(qty) || qty <= 0) {
      alert("Please enter valid quantity and price");
      return;
    }

    let name = itemName;
    let finalProductId = productId;
    
    if (entryMode === 'product' && productId) {
      const product = inventory.find(p => p.id.toString() === productId);
      if (product) name = product.size ? `${product.name} (${product.size})` : product.name;
    } else {
      finalProductId = '';
    }

    if (!name) {
      alert("Please select a product or enter an item name");
      return;
    }

    setCart([...cart, {
      productId: finalProductId,
      name,
      quantity: qty,
      unitPrice: up,
      total: up * qty,
      vatStatus
    }]);

    // Reset item fields but keep customer/date
    setProductId('');
    setItemName('');
    setQuantity('1');
    setUnitPrice('');
    setAmount('');
    setVatStatus('vatable');
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If cart is empty, try to add current item first
    let finalItems = [...cart];
    if (finalItems.length === 0 || editingId) {
      const up = parseFloat(unitPrice);
      const qty = parseInt(quantity);
      let name = itemName;
      let finalProductId = productId;
      
      if (entryMode === 'product' && productId) {
        const product = inventory.find(p => p.id.toString() === productId);
        if (product) name = product.size ? `${product.name} (${product.size})` : product.name;
      } else {
        finalProductId = '';
      }

      if (!isNaN(up) && !isNaN(qty) && qty > 0 && (name || entryMode === 'product')) {
        const newItem = {
          productId: finalProductId,
          name: name || 'Product',
          quantity: qty,
          unitPrice: up,
          total: up * qty,
          vatStatus
        };
        
        if (editingId) {
          finalItems = [newItem];
        } else {
          finalItems.push(newItem);
        }
      }
    }

    if (finalItems.length === 0) {
      alert("Please add at least one item");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const item = finalItems[0];
        const res = await apiFetch(`/api/transactions/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            amount: item.total,
            category: category || (type === 'sale' ? 'Sales' : 'Expense'),
            product_id: item.productId || null,
            customer_id: customerId || null,
            quantity: item.quantity,
            description: description || null,
            item_name: item.name,
            date,
            vat_status: item.vatStatus
          })
        });
        if (!res.ok) throw new Error("Failed to update transaction");
      } else {
        // Record each item as a separate transaction for now (since backend is simple)
        // In a real app, we'd have a single transaction with multiple items
        for (const item of finalItems) {
          const res = await apiFetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              amount: item.total,
              category: category || (type === 'sale' ? 'Sales' : 'Expense'),
              product_id: item.productId || null,
              customer_id: customerId || null,
              quantity: item.quantity,
              description: description || null,
              item_name: item.name,
              date,
              vat_status: item.vatStatus
            })
          });
          
          if (!res.ok) throw new Error("Failed to save item: " + item.name);
        }
      }
      
      setAmount('');
      setUnitPrice('');
      setQuantity('1');
      setItemName('');
      setCategory('');
      setProductId('');
      setCustomerId('');
      setDescription('');
      setCart([]);
      setEditingId(null);
      setDate(new Date().toISOString().split('T')[0]);
      
      await onUpdate();
    } catch (error) {
      console.error("Transaction error:", error);
      alert("Failed to record transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Quick Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Today's Sales</p>
            <p className="text-xl font-bold text-emerald-900">₦{todaySales.toLocaleString()}</p>
          </div>
          <TrendingUp className="text-emerald-400" size={24} />
        </div>
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Today's Expenses</p>
            <p className="text-xl font-bold text-rose-900">₦{todayExpenses.toLocaleString()}</p>
          </div>
          <TrendingDown className="text-rose-400" size={24} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Entry Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm sticky top-8">
            <h3 className="font-bold text-lg mb-6">{editingId ? 'Edit Entry' : 'New Entry'}</h3>
            <div className="flex p-1 bg-stone-100 rounded-xl mb-6">
              <button 
                onClick={() => setType('sale')}
                className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", type === 'sale' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500")}
              >
                Sale
              </button>
              <button 
                onClick={() => setType('expense')}
                className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-stone-500")}
              >
                Expense
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div className="flex p-1 bg-stone-50 border border-stone-100 rounded-xl">
                <button 
                  type="button"
                  onClick={() => {
                    setEntryMode('product');
                    setProductId('');
                  }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    entryMode === 'product' ? "bg-white text-emerald-600 shadow-sm border border-stone-100" : "text-stone-400"
                  )}
                >
                  Inventory Items
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setEntryMode('manual');
                    setProductId('');
                    setItemName('');
                    setUnitPrice('');
                    setAmount('');
                  }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    entryMode === 'manual' ? "bg-white text-emerald-600 shadow-sm border border-stone-100" : "text-stone-400"
                  )}
                >
                  Other / Manual
                </button>
              </div>

              {entryMode === 'product' ? (
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Select Item</label>
                  <select 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={productId}
                    onChange={e => setProductId(e.target.value)}
                  >
                    <option value="">Choose from list...</option>
                    {inventory.map(item => (
                      <option key={item.id} value={item.id} disabled={item.stock <= 0 && type === 'sale'}>
                        {item.name} {item.size ? `(${item.size}) ` : ''}(₦{item.price.toLocaleString()}) - {item.stock} in stock
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[10px] text-stone-400 italic">Tip: You can also tap products in the gallery to select them.</p>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                    {type === 'sale' ? 'Item Name' : 'Expense Name'}
                  </label>
                  <input 
                    placeholder={type === 'sale' ? 'e.g. Custom Service' : 'e.g. Office Supplies'}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                  />
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Quantity</label>
                  <input 
                    required type="number"
                    min="1"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Unit Price (₦)</label>
                  <input 
                    required type="number"
                    min="0"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Total Amount (₦)</label>
                <input 
                  required type="number"
                  readOnly
                  className="w-full bg-stone-100 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-700 cursor-not-allowed"
                  value={amount}
                  placeholder="Calculated automatically"
                />
                <p className="mt-1 text-[9px] text-stone-400 italic">Total is synchronized with Quantity × Unit Price</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">VAT Status</label>
                <select 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={vatStatus}
                  onChange={e => setVatStatus(e.target.value as any)}
                >
                  <option value="vatable">VATable (7.5%)</option>
                  <option value="exempt">Exempt (0%)</option>
                  <option value="zero_rated">Zero-Rated (0%)</option>
                </select>
              </div>

              <div className="pt-2">
                <button 
                  type="button"
                  onClick={addToCart}
                  className="w-full bg-emerald-50 text-emerald-600 border border-emerald-200 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all"
                >
                  <Plus size={18} />
                  Add to List
                </button>
              </div>

              <div className="h-px bg-stone-100 my-4" />

              {type === 'sale' && (
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Customer (Optional)</label>
                  <select 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                  >
                    <option value="">Select Customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Category</label>
                <input 
                  placeholder={type === 'sale' ? 'e.g. Retail, Wholesale' : 'e.g. Rent, Utilities'}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                />
              </div>


              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Notes</label>
                <textarea 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none h-20"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="pt-4">
                {cart.length > 0 && (
                  <div className="mb-4 p-4 bg-emerald-900 rounded-2xl text-white">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-70">Total Summary</span>
                      <span className="text-lg font-bold">₦{cartTotal.toLocaleString()}</span>
                    </div>
                    <div className="text-[10px] opacity-70">
                      {cart.length} item{cart.length !== 1 ? 's' : ''} in list
                    </div>
                  </div>
                )}
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all",
                    isSubmitting ? "opacity-50 cursor-not-allowed" : "",
                    type === 'sale' ? "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700" : "bg-rose-600 shadow-rose-100 hover:bg-rose-700"
                  )}
                >
                  {isSubmitting ? 'Recording...' : editingId ? 'Update Transaction' : cart.length > 0 ? `Record ${cart.length} Items` : `Record ${type === 'sale' ? 'Sale' : 'Expense'}`}
                </button>
                {editingId && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setAmount('');
                      setUnitPrice('');
                      setQuantity('1');
                      setItemName('');
                      setCategory('');
                      setProductId('');
                      setCustomerId('');
                      setDescription('');
                    }}
                    className="w-full mt-2 py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Product Gallery */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h3 className="font-bold text-lg">Product Gallery</h3>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search products..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {inventory
                .filter(item => item.name.toLowerCase().includes(productSearch.toLowerCase()))
                .map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setEntryMode('product');
                      setProductId(item.id.toString());
                      setUnitPrice(item.price.toString());
                      // Scroll to form on mobile
                      if (window.innerWidth < 1024) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className={cn(
                      "group relative bg-stone-50 border rounded-2xl p-3 text-left transition-all hover:border-emerald-500 hover:bg-emerald-50 cursor-pointer",
                      productId === item.id.toString() && entryMode === 'product' ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-stone-100"
                    )}
                  >
                    <div className="aspect-square rounded-xl bg-stone-200 mb-3 overflow-hidden relative">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400">
                          <Package size={24} />
                        </div>
                      )}
                      {item.stock <= 0 && (
                        <div className="absolute inset-0 bg-stone-900/60 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Out of Stock</span>
                        </div>
                      )}
                    </div>
                    <h4 className="font-bold text-xs truncate mb-1">{item.name} {item.size && <span className="text-stone-500 font-normal">({item.size})</span>}</h4>
                    <p className="text-emerald-600 font-bold text-sm">₦{item.price.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-md",
                        item.stock > 10 ? "bg-emerald-100 text-emerald-700" : item.stock > 0 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                      )}>
                        {item.stock} in stock
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEntryMode('product');
                          setProductId(item.id.toString());
                          setUnitPrice(item.price.toString());
                          setQuantity('1');
                          // We need to call addToCart but it's a local function
                          // I'll just manually add it to cart here to be safe
                          setCart(prev => [...prev, {
                            productId: item.id.toString(),
                            name: item.size ? `${item.name} (${item.size})` : item.name,
                            quantity: 1,
                            unitPrice: item.price,
                            total: item.price,
                            vatStatus: item.vat_status || 'vatable'
                          }]);
                        }}
                        disabled={item.stock <= 0 && type === 'sale'}
                        className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Cart / List Display */}
          {cart.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg">Items in this {type === 'sale' ? 'Sale' : 'Expense'}</h3>
                <button onClick={() => setCart([])} className="text-xs font-bold text-rose-500 hover:underline">Clear All</button>
              </div>
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 font-bold border border-stone-100">
                        {item.quantity}x
                      </div>
                      <div>
                        <p className="font-bold text-sm">{item.name}</p>
                        <p className="text-[10px] text-stone-400">
                          ₦{item.unitPrice.toLocaleString()} per unit
                          <span className="ml-2 px-1.5 py-0.5 bg-stone-200 rounded text-[8px] uppercase tracking-widest font-bold text-stone-600">
                            {item.vatStatus === 'vatable' ? 'VATable' : item.vatStatus === 'exempt' ? 'Exempt' : 'Zero-Rated'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-bold text-emerald-700">₦{item.total.toLocaleString()}</p>
                      <button onClick={() => removeFromCart(index)} className="p-2 text-stone-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History List */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-lg">Transaction History</h3>
              <div className="flex gap-2">
                <button className="p-2 bg-stone-50 rounded-lg text-stone-400 hover:text-stone-900 transition-all"><FileText size={18} /></button>
              </div>
            </div>

            <div className="space-y-4">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 border border-stone-100 rounded-2xl hover:bg-stone-50 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      t.type === 'sale' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {t.type === 'sale' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-sm">
                        {t.item_name || t.category}
                        {t.type === 'sale' && (
                          <span className="ml-2 px-1.5 py-0.5 bg-stone-200 rounded text-[8px] uppercase tracking-widest font-bold text-stone-600">
                            {t.vat_status === 'vatable' ? 'VATable' : t.vat_status === 'exempt' ? 'Exempt' : 'Zero-Rated'}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-stone-400">
                        {t.quantity > 1 ? `${t.quantity} items • ` : ''}
                        {t.customer_id ? `Customer: ${customers.find(c => c.id === t.customer_id)?.name} • ` : ''}
                        {t.description || 'No notes'}
                      </p>
                    </div>
                  </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={cn("font-bold", t.type === 'sale' ? "text-emerald-600" : "text-rose-600")}>
                          {t.type === 'sale' ? '+' : '-'}₦{t.amount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{t.date}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button 
                          onClick={() => handleEdit(t)}
                          title="Edit Transaction"
                          className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(t.id)}
                          title="Delete Transaction"
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showPinPrompt && (
        <PinPrompt 
          onConfirm={(pin) => handleDelete(showPinPrompt, pin)}
          onCancel={() => setShowPinPrompt(null)}
          isLoading={isSubmitting}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog 
          title="Delete Transaction?"
          message="Are you sure you want to delete this transaction? Stock changes will be reverted."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          isLoading={isSubmitting}
        />
      )}
    </div>
  );
}

// --- Customers Component ---
function Customers({ customers, onUpdate }: { customers: Customer[], onUpdate: () => Promise<void> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCustomer,
          created_at: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error("Failed to save customer");
      setNewCustomer({ name: '', email: '', phone: '', address: '' });
      setShowAdd(false);
      await onUpdate();
    } catch (error) {
      console.error(error);
      alert("Failed to save customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Customer Database</h3>
          <p className="text-stone-400 text-sm">Manage your client relationships and contact details</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
        >
          <PlusCircle size={18} />
          Add Customer
        </button>
      </div>

      {showAdd && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm"
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Full Name</label>
                <input 
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Email Address</label>
                <input 
                  type="email"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Address</label>
                <input 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={newCustomer.address}
                  onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? (
                    <>
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Saving...
                    </>
                  ) : 'Save Customer'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="px-6 py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100">Cancel</button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map(customer => (
          <div key={customer.id} className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-400">
                <Users size={24} />
              </div>
              <div>
                <h4 className="font-bold text-lg leading-tight">{customer.name}</h4>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Added {customer.created_at}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {customer.email && (
                <div className="flex items-center gap-3 text-sm text-stone-600">
                  <Mail size={16} className="text-stone-400" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-3 text-sm text-stone-600">
                  <Phone size={16} className="text-stone-400" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-3 text-sm text-stone-600">
                  <MapPin size={16} className="text-stone-400" />
                  <span className="line-clamp-1">{customer.address}</span>
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t border-stone-100 flex justify-between items-center">
              <button className="text-xs font-bold text-emerald-600 hover:underline">View History</button>
              <button className="p-2 text-stone-400 hover:text-stone-900 transition-all">
                <SettingsIcon size={16} />
              </button>
            </div>
          </div>
        ))}
        {customers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-stone-200 border-dashed">
            <Users size={48} className="mx-auto text-stone-200 mb-4" />
            <h5 className="font-bold text-stone-900 mb-1">No Customers Yet</h5>
            <p className="text-stone-400 text-sm">Start building your database to track sales by client.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Reports Component ---
function CACAnnualReport({ user, transactions, business }: { user: User | null, transactions: Transaction[], business: BusinessInfo | null }) {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [rcNumber, setRcNumber] = useState(business?.rc_number || '');
  const [companyName, setCompanyName] = useState(business?.name || '');
  const [address, setAddress] = useState('');
  const [activity, setActivity] = useState('');
  const [secretary, setSecretary] = useState('');
  const [directors, setDirectors] = useState('');
  const [shareholders, setShareholders] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isRegisteringGlobally, setIsRegisteringGlobally] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ name: string; address?: string; activity?: string; registration_number?: string; business_type?: string; source?: string; verification_status?: string; confirmed: boolean } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (business?.rc_number && !rcNumber) {
      setRcNumber(business.rc_number);
    }
    if (business?.name && !companyName) {
      setCompanyName(business.name);
    }
  }, [business]);

  const handleReset = () => {
    setRcNumber('');
    setCompanyName('');
    setAddress('');
    setActivity('');
    setLookupResult(null);
  };

  const handleLookupRC = async () => {
    // Clean the RC number: remove "RC" prefix and non-digit characters except spaces
    const cleanRC = rcNumber.replace(/RC\s*/i, '').trim();
    if (!cleanRC || cleanRC.length < 3) {
      setLookupError("Please enter a valid RC number.");
      return;
    }
    
    setIsLookingUp(true);
    setLookupError(null);
    setLookupResult(null); // Clear previous result
    try {
      const response = await apiFetch('/api/business/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registration_number: cleanRC })
      });

      if (!response.ok) {
        let errMsg = 'Failed to verify RC number';
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const business = data.business;

      console.log("Business Lookup result:", data);

      if (business && business.name && business.name !== "NOT_FOUND") {
        setLookupResult({ 
          name: business.name, 
          address: business.address || '', 
          activity: business.activity || '', 
          registration_number: business.registration_number,
          business_type: business.business_type,
          source: data.source,
          verification_status: business.verification_status,
          confirmed: false 
        });
      } else {
        setLookupError(`Could not find a company with RC number ${cleanRC}. Please check the number or enter the name manually in Settings.`);
      }
    } catch (error: any) {
      console.error("CAC Lookup error:", error);
      const errorStr = String(error);
      if (errorStr.includes("API key not valid") || error.status === 400 || error.message?.includes("API_KEY_INVALID")) {
        setLookupError("Invalid Gemini API key. Please check your AI Studio Secrets panel and ensure you have a valid key configured.");
      } else {
        setLookupError(`Error looking up RC number: ${error.message || "Please try again or enter the name manually."}`);
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const confirmLookup = async () => {
    if (!lookupResult) return;
    
    // Update business name in settings if user confirms
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.id, 'business_info', 'info'), { 
          name: lookupResult.name,
          rc_number: rcNumber 
        }, { merge: true });
        
        // Also verify in the global dataset
        try {
          await apiFetch('/api/business/verify', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              registration_number: rcNumber,
              verification_proof: 'User confirmed via lookup'
            })
          });
        } catch (verifyErr) {
          console.error("Error verifying in global dataset:", verifyErr);
        }

        // Automatically populate form fields
        setCompanyName(lookupResult.name);
        if (lookupResult.address) setAddress(lookupResult.address);
        if (lookupResult.activity) setActivity(lookupResult.activity);
        
        setLookupResult({ ...lookupResult, confirmed: true });
      } catch (e) {
        console.error("Error updating business name:", e);
      }
    }
  };

  const handleRegisterGlobally = async () => {
    if (!companyName || !rcNumber) {
      alert("Company Name and RC Number are required for global registration.");
      return;
    }
    
    setIsRegisteringGlobally(true);
    try {
      const response = await apiFetch('/api/business/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          registration_number: rcNumber,
          business_type: 'Business Name', // Default
          address: address,
          registration_date: ''
        })
      });

      if (response.ok) {
        alert("Business successfully registered in the BizPulse Global Dataset!");
        // Refresh lookup result to show it's now internal
        setLookupResult({
          name: companyName,
          address: address,
          activity: activity,
          registration_number: rcNumber,
          source: 'internal',
          verification_status: 'unverified',
          confirmed: true
        });
      } else {
        const data = await response.json();
        if (data.error === "Business already exists in our records") {
          alert("This business is already in our global dataset.");
        } else {
          throw new Error(data.error || "Failed to register globally");
        }
      }
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsRegisteringGlobally(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const isBackdated = year < currentYear - 1;
  const isUnlocked = user?.unlocked_cac_years?.includes(year) || false;
  const requiresUnlock = isBackdated && !isUnlocked;

  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || "user@example.com",
    amount: 5000 * 100, // ₦5,000 in kobo
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder',
  };

  const monnifyConfig = {
    amount: 5000,
    currency: "NGN",
    reference: (new Date()).getTime().toString(),
    customerFullName: business?.name || "Customer",
    customerEmail: user?.email || "user@example.com",
    apiKey: import.meta.env.VITE_MONNIFY_API_KEY || 'MK_TEST_PLACEHOLDER',
    contractCode: import.meta.env.VITE_MONNIFY_CONTRACT_CODE || '1234567890',
    paymentDescription: `Unlock CAC Report for ${year}`,
    isTestMode: business?.monnify_test_mode ?? (import.meta.env.VITE_MONNIFY_TEST_MODE?.toLowerCase() === 'true'),
  };

  const initializePaystack = usePaystackPayment(paystackConfig);

  const handleUnlockYear = async () => {
    if (!user) return;
    
    const onSuccess = async (reference: any) => {
      setIsUnlocking(true);
      try {
        const updatedYears = [...(user.unlocked_cac_years || []), year];
        await updateDoc(doc(db, 'users', user.id), {
          unlocked_cac_years: updatedYears
        });
        await recordBillingHistory(
          user.id,
          5000,
          `Unlock CAC Report for ${year}`,
          business?.payment_gateway || 'paystack',
          reference?.reference || reference?.transactionReference || 'unknown'
        );
        alert(`Payment successful! You have unlocked the CAC Report for ${year}.`);
      } catch (error: any) {
        alert(error.message);
      } finally {
        setIsUnlocking(false);
      }
    };

    const onClose = () => {
      alert('Payment cancelled.');
    };

    if (business?.payment_gateway === 'monnify') {
      window.MonnifySDK?.initialize({
        ...monnifyConfig,
        onComplete: onSuccess,
        onClose: onClose
      });
    } else {
      initializePaystack({ onSuccess, onClose });
    }
  };

  const getFilteredTransactions = () => {
    const now = new Date();
    now.setFullYear(year);
    const start = startOfYear(now);
    const end = endOfYear(now);

    return transactions.filter(t => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start, end });
    });
  };

  const filtered = getFilteredTransactions();
  const turnover = filtered.filter(t => t.type === 'sale').reduce((a, b) => a + b.amount, 0);
  const expenses = filtered.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  const profit = turnover - expenses;
  const netAssets = profit;

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);
    
    // Ensure we are at the top of the page for capture
    window.scrollTo(0, 0);
    
    // Small delay to ensure styles are applied
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const opt = {
        margin:       10,
        filename:     `CAC_Annual_Report_${companyName || 'Business'}_${year}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff',
          allowTaint: true,
          windowWidth: 1024,
          onclone: (clonedDoc: Document) => {
            // Find the report in the clone
            const report = clonedDoc.querySelector('.cac-report-container') as HTMLElement;
            if (report) {
              report.style.width = '1024px';
              report.style.padding = '40px';
              report.style.margin = '0';
              report.style.height = 'auto';
              report.style.overflow = 'visible';
              report.style.boxShadow = 'none';
              report.style.border = 'none';
              report.style.display = 'block';
              report.style.textRendering = 'auto';
              
              // html2canvas doesn't support oklch colors used by Tailwind v4
              // We need to replace them with hex/rgb values in the cloned document
              const elements = [report, ...Array.from(report.querySelectorAll('*'))];
              elements.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                
                if (style.color && style.color.includes('oklch')) htmlEl.style.color = '#1c1917';
                if (style.backgroundColor && style.backgroundColor.includes('oklch')) htmlEl.style.backgroundColor = '#ffffff';
                if (style.borderColor && style.borderColor.includes('oklch')) htmlEl.style.borderColor = '#e7e5e4';
                if (style.boxShadow && style.boxShadow.includes('oklch')) htmlEl.style.boxShadow = 'none';
                if (style.textShadow && style.textShadow.includes('oklch')) htmlEl.style.textShadow = 'none';
              });
              
              // Force standard font for capture
              report.style.fontFamily = '"Times New Roman", Times, serif';
              
              // Ensure all sections are visible
              const sections = report.querySelectorAll('section');
              sections.forEach(s => {
                (s as HTMLElement).style.display = 'block';
                (s as HTMLElement).style.visibility = 'visible';
                (s as HTMLElement).style.opacity = '1';
                (s as HTMLElement).style.marginBottom = '30px';
              });

              // Ensure tables are correctly sized
              const tables = report.querySelectorAll('table');
              tables.forEach(t => {
                (t as HTMLElement).style.width = '100%';
                (t as HTMLElement).style.borderCollapse = 'collapse';
              });
            }

            // html2canvas fails when it encounters oklch() in ANY stylesheet or inline style, 
            // even if not used by the element. We must strip it from the clone.
            
            // 1. Strip from style tags
            const styleTags = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styleTags.length; i++) {
              const style = styleTags[i];
              try {
                if (style.innerHTML.includes('oklch')) {
                  style.innerHTML = style.innerHTML.replace(/oklch\([^)]+\)/g, '#000000');
                }
              } catch (e) {
                // Some style tags might not be editable
              }
            }
            
            // 2. Strip from inline styles
            const allElements = clonedDoc.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              if (el.style && el.style.cssText && el.style.cssText.includes('oklch')) {
                el.style.cssText = el.style.cssText.replace(/oklch\([^)]+\)/g, '#000000');
              }
            }
          }
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', 'h1', 'h2', 'h3', 'p', 'li', '.avoid-break'] }
      };

      const html2pdfFn = typeof html2pdf === 'function' ? html2pdf : (html2pdf as any).default;
      await html2pdfFn().set(opt).from(reportRef.current).save();
    } catch (error: any) {
      console.error('PDF Generation Error:', error);
      alert(`PDF generation failed (${error?.message || error}). Falling back to Print dialog - please select "Save as PDF" as your printer.`);
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (isPreview) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center print:hidden">
          <button onClick={() => setIsPreview(false)} className="text-stone-500 hover:text-stone-900 flex items-center gap-2">
            <ChevronRight className="rotate-180" size={16} /> Back to Form
          </button>
          <div className="flex gap-3">
            <button 
              onClick={() => window.print()} 
              className="bg-stone-100 text-stone-600 px-6 py-2 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Print
            </button>
            <button 
              onClick={handleDownloadPDF} 
              disabled={isGeneratingPDF}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isGeneratingPDF ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
              ) : <Download size={16} />}
              Download PDF
            </button>
          </div>
        </div>

        <div ref={reportRef} className="cac-report-container bg-white p-12 rounded-2xl border border-stone-200 shadow-sm print:shadow-none print:border-none print:p-0">
          <div className="text-center mb-12 border-b border-stone-200 pb-8 avoid-break">
            <h1 className="text-3xl font-bold uppercase tracking-widest text-stone-900">Corporate Affairs Commission</h1>
            <h2 className="text-xl font-medium text-stone-600 mt-2">Annual Report of {companyName || 'Business'}</h2>
            <p className="text-stone-500 mt-1">For the Financial Year Ended 31st December, {year}</p>
          </div>

          <div className="space-y-8">
            <section>
              <h3 className="text-lg font-bold border-b border-stone-100 pb-2 mb-4 uppercase text-stone-400 text-sm tracking-wider">1. Company Details</h3>
              <table>
                <tbody>
                  <tr>
                    <td className="report-label">Company Name:</td>
                    <td className="report-value uppercase">{companyName || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td className="report-label">RC Number:</td>
                    <td className="report-value">{rcNumber || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Registered Address:</td>
                    <td className="report-value">{address || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Principal Business Activity:</td>
                    <td className="report-value">{activity || 'Not specified'}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h3 className="text-lg font-bold border-b border-stone-100 pb-2 mb-4 uppercase text-stone-400 text-sm tracking-wider">2. Financial Summary</h3>
              <table>
                <tbody>
                  <tr>
                    <td className="report-label">Total Turnover:</td>
                    <td className="report-value">₦{turnover.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Total Expenses:</td>
                    <td className="report-value">₦{expenses.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Net Profit/Loss:</td>
                    <td className="report-value">₦{profit.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Net Assets:</td>
                    <td className="report-value">₦{netAssets.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h3 className="text-lg font-bold border-b border-stone-100 pb-2 mb-4 uppercase text-stone-400 text-sm tracking-wider">3. Officers & Shareholders</h3>
              <table>
                <tbody>
                  <tr>
                    <td className="report-label">Company Secretary:</td>
                    <td className="report-value">{secretary || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Directors:</td>
                    <td className="report-value whitespace-pre-wrap">{directors || 'Not specified'}</td>
                  </tr>
                  <tr>
                    <td className="report-label">Shareholders:</td>
                    <td className="report-value whitespace-pre-wrap">{shareholders || 'Not specified'}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <div className="pt-16 mt-16 border-t border-stone-200 grid grid-cols-2 gap-12">
              <div>
                <div className="border-b border-stone-400 h-8 mb-2"></div>
                <p className="text-xs text-stone-500 text-center">Director Signature & Date</p>
              </div>
              <div>
                <div className="border-b border-stone-400 h-8 mb-2"></div>
                <p className="text-xs text-stone-500 text-center">Secretary Signature & Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">CAC Provisional Annual Report</h3>
          <p className="text-stone-400 text-sm">Fill in the details to generate your CAC annual return document</p>
        </div>
        <select 
          className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold outline-none shadow-sm"
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
        >
          {years.map(y => <option key={y} value={y}>{y} Financial Year</option>)}
        </select>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
        {requiresUnlock ? (
          <div className="text-center py-12 space-y-6">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield size={40} />
            </div>
            <h4 className="text-2xl font-bold text-stone-900">Unlock {year} Annual Report</h4>
            <p className="text-stone-500 max-w-md mx-auto">
              Your current plan covers the most recent financial year. To generate and auto-calculate a backdated CAC Annual Report for {year}, a one-time preparation fee is required.
            </p>
            <div className="bg-stone-50 p-6 rounded-2xl inline-block text-left border border-stone-100 mb-6">
              <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mb-2">One-time fee</p>
              <p className="text-4xl font-bold text-stone-900">₦5,000</p>
              <p className="text-xs text-stone-500 mt-2">Includes auto-calculation of {year} financials.</p>
            </div>
            <div>
              <button 
                onClick={handleUnlockYear}
                disabled={isUnlocking}
                className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
              >
                {isUnlocking ? 'Processing Payment...' : `Pay ₦5,000 to Unlock ${year}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Company Name</label>
                </div>
                <div className="relative">
                  <input 
                    type="text" 
                    value={companyName} 
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Official Company Name"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10" 
                  />
                  {companyName && (
                    <button 
                      onClick={() => setCompanyName('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-stone-400">Can be edited manually or populated via lookup</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">RC Number</label>
                  <div className="flex items-center gap-3">
                    {(rcNumber || companyName || address) && (
                      <button 
                        onClick={handleReset}
                        className="text-[10px] font-bold text-red-500 uppercase tracking-wider hover:underline"
                      >
                        Reset All Fields
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={rcNumber} 
                      onChange={e => setRcNumber(e.target.value)}
                      placeholder="e.g. RC 1234567"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10" 
                    />
                    {rcNumber && (
                      <button 
                        onClick={() => setRcNumber('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={handleLookupRC}
                    disabled={isLookingUp || !rcNumber}
                    className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-200 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLookingUp ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full"
                      />
                    ) : <Search size={14} />}
                    Lookup
                  </button>
                </div>
              </div>
              {lookupError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="md:col-span-2 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 text-sm"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  <div className="flex-1">
                    <p>{lookupError}</p>
                    <button 
                      onClick={handleRegisterGlobally}
                      disabled={isRegisteringGlobally || !companyName || !rcNumber}
                      className="mt-2 text-xs font-bold underline hover:no-underline disabled:opacity-50"
                    >
                      {isRegisteringGlobally ? 'Registering...' : 'Register this business in BizPulse Global Dataset instead?'}
                    </button>
                  </div>
                </motion.div>
              )}
              {lookupResult && !lookupResult.confirmed && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="md:col-span-2 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">
                          {lookupResult.source === 'internal' ? 'Internal BizPulse Record' : 'External Directory Match'}
                        </p>
                        {lookupResult.verification_status === 'verified' && (
                          <span className="bg-emerald-100 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                            <Shield size={8} /> VERIFIED
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-stone-900">{lookupResult.name}</p>
                      {lookupResult.address && (
                        <p className="text-[10px] text-stone-500 mt-1">Address: {lookupResult.address}</p>
                      )}
                      {lookupResult.activity && (
                        <p className="text-[10px] text-stone-500">Activity: {lookupResult.activity}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setLookupResult(null)}
                      className="text-stone-400 hover:text-stone-600 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={confirmLookup}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      Confirm & Populate Details
                    </button>
                  </div>
                </motion.div>
              )}
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Registered Office Address</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={address} 
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Full physical address"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10" 
                  />
                  {address && (
                    <button 
                      onClick={() => setAddress('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Principal Business Activity</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={activity} 
                    onChange={e => setActivity(e.target.value)}
                    placeholder="e.g. General Merchandise, IT Consulting"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10" 
                  />
                  {activity && (
                    <button 
                      onClick={() => setActivity('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-stone-100 pt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Company Secretary</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={secretary} 
                    onChange={e => setSecretary(e.target.value)}
                    placeholder="Full Name"
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10" 
                  />
                  {secretary && (
                    <button 
                      onClick={() => setSecretary('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Directors</label>
                <div className="relative">
                  <textarea 
                    value={directors} 
                    onChange={e => setDirectors(e.target.value)}
                    placeholder="List directors (one per line)"
                    rows={3}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none pr-10" 
                  />
                  {directors && (
                    <button 
                      onClick={() => setDirectors('')}
                      className="absolute right-3 top-4 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Shareholders & Holdings</label>
                <div className="relative">
                  <textarea 
                    value={shareholders} 
                    onChange={e => setShareholders(e.target.value)}
                    placeholder="e.g. John Doe - 1,000,000 shares"
                    rows={3}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none pr-10" 
                  />
                  {shareholders && (
                    <button 
                      onClick={() => setShareholders('')}
                      className="absolute right-3 top-4 text-stone-400 hover:text-stone-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
              <h4 className="font-bold text-sm text-stone-900 mb-4">Auto-Calculated Financials ({year})</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-stone-500 text-xs mb-1">Turnover</p>
                  <p className="font-bold text-emerald-600">₦{turnover.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-stone-500 text-xs mb-1">Expenses</p>
                  <p className="font-bold text-rose-600">₦{expenses.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-stone-500 text-xs mb-1">Net Profit</p>
                  <p className="font-bold text-stone-900">₦{profit.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-stone-500 text-xs mb-1">Net Assets</p>
                  <p className="font-bold text-stone-900">₦{netAssets.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[10px] text-stone-400 mt-4">These values are automatically calculated from your recorded transactions for the selected financial year.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <button 
                onClick={async () => {
                  if (user) {
                    try {
                      await setDoc(doc(db, 'users', user.id, 'business_info', 'info'), { 
                        name: companyName,
                        rc_number: rcNumber,
                        address: address,
                        activity: activity
                      }, { merge: true });
                      alert("Business profile updated successfully!");
                    } catch (e) {
                      console.error("Error updating profile:", e);
                      alert("Failed to update profile.");
                    }
                  }
                }}
                className="flex-1 bg-stone-100 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
              >
                Save to My Profile
              </button>
              <button 
                onClick={() => setIsPreview(true)}
                className="flex-[2] bg-stone-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-all shadow-lg"
              >
                Generate Provisional Report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Tax Estimator Component ---
function TaxEstimator({ user, transactions, business }: { user: User | null, transactions: Transaction[], business: BusinessInfo | null }) {
  const [businessType, setBusinessType] = useState('Small Company');
  const [taxType, setTaxType] = useState('both');
  const [employees, setEmployees] = useState('0');
  const [avgSalary, setAvgSalary] = useState('50000');
  const [state, setState] = useState('Lagos');
  const [year, setYear] = useState(new Date().getFullYear());
  const [estimate, setEstimate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Auto-calculate annual turnover and profit from transactions
  const start = startOfYear(new Date(year, 0, 1));
  const end = endOfYear(new Date(year, 11, 31));
  const annualTrans = transactions.filter(t => isWithinInterval(parseISO(t.date), { start, end }));
  const annualTurnover = annualTrans.filter(t => t.type === 'sale').reduce((a, b) => a + b.amount, 0);
  const annualExpenses = annualTrans.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  const annualProfit = annualTurnover - annualExpenses;

  // Calculate monthly sales for VAT
  const monthlySales = Array(12).fill(null).map(() => ({ vatable: 0, exempt: 0, zero_rated: 0 }));
  annualTrans.filter(t => t.type === 'sale').forEach(t => {
    const month = new Date(t.date).getMonth();
    const status = t.vat_status || 'vatable';
    if (status === 'vatable') monthlySales[month].vatable += t.amount;
    else if (status === 'exempt') monthlySales[month].exempt += t.amount;
    else if (status === 'zero_rated') monthlySales[month].zero_rated += t.amount;
  });

  const reportRef = useRef<HTMLDivElement>(null);

  const handleDownloadReport = async () => {
    if (!reportRef.current || !estimate || isDownloading) return;
    setIsDownloading(true);
    
    try {
      // Ensure we are at the top of the page for capture
      window.scrollTo(0, 0);
      
      // Small delay to ensure styles are applied and rendering is complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const opt = {
        margin:       10,
        filename:     `Tax_Estimate_${year}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff',
          allowTaint: true,
          windowWidth: 1024,
          onclone: (clonedDoc: Document) => {
            const report = clonedDoc.getElementById('tax-report-content');
            if (report) {
              report.style.width = '1024px';
              report.style.padding = '40px';
              report.style.margin = '0';
              report.style.height = 'auto';
              report.style.overflow = 'visible';
              report.style.display = 'block';
              
              // html2canvas doesn't support oklch colors used by Tailwind v4
              // We need to replace them with hex/rgb values in the cloned document
              const elements = [report, ...Array.from(report.querySelectorAll('*'))];
              elements.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                
                if (style.color && style.color.includes('oklch')) htmlEl.style.color = '#1c1917';
                if (style.backgroundColor && style.backgroundColor.includes('oklch')) htmlEl.style.backgroundColor = '#ffffff';
                if (style.borderColor && style.borderColor.includes('oklch')) htmlEl.style.borderColor = '#e7e5e4';
                if (style.boxShadow && style.boxShadow.includes('oklch')) htmlEl.style.boxShadow = 'none';
                if (style.textShadow && style.textShadow.includes('oklch')) htmlEl.style.textShadow = 'none';
              });
            }
            
            // html2canvas fails when it encounters oklch() in ANY stylesheet or inline style, 
            // even if not used by the element. We must strip it from the clone.
            
            // 1. Strip from style tags
            const styleTags = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styleTags.length; i++) {
              const style = styleTags[i];
              try {
                if (style.innerHTML.includes('oklch')) {
                  style.innerHTML = style.innerHTML.replace(/oklch\([^)]+\)/g, '#000000');
                }
              } catch (e) {
                // Some style tags might not be editable
              }
            }
            
            // 2. Strip from inline styles
            const allElements = clonedDoc.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              if (el.style && el.style.cssText && el.style.cssText.includes('oklch')) {
                el.style.cssText = el.style.cssText.replace(/oklch\([^)]+\)/g, '#000000');
              }
            }
          }
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', 'h1', 'h2', 'h3', 'p', 'li', '.avoid-break'] }
      };

      const html2pdfFn = typeof html2pdf === 'function' ? html2pdf : (html2pdf as any).default;
      await html2pdfFn().set(opt).from(reportRef.current).save();
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      alert(`PDF generation failed (${err?.message || err}). Falling back to Print dialog - please select "Save as PDF" as your printer.`);
      handlePrintReport();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintReport = () => {
    if (!reportRef.current) return;
    const printContents = reportRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Tax Report ${year}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #1c1917; line-height: 1.6; }
              h1, h2, h3, h4 { color: #1c1917; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
              h1 { font-size: 1.5rem; }
              h2 { font-size: 1.25rem; }
              h3 { font-size: 1.125rem; }
              p { margin-bottom: 1em; }
              ul, ol { margin-bottom: 1em; padding-left: 1.5em; }
              li { margin-bottom: 0.25em; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
              th, td { border: 1px solid #e7e5e4; padding: 0.5rem; text-align: left; }
              th { background-color: #f5f5f4; font-weight: 600; }
              strong { font-weight: 600; }
              em { font-style: italic; }
            </style>
          </head>
          <body>
            ${printContents}
            <script>
              window.onload = () => {
                window.print();
                setTimeout(() => window.close(), 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const generateEstimate = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/ai/generate-tax-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taxType,
          year,
          businessType,
          annualTurnover,
          annualProfit,
          monthlySales,
          employees,
          avgSalary,
          state
        })
      });

      if (!response.ok) {
        let errMsg = 'Failed to generate estimate';
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      setEstimate(data.estimate);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating the estimate.');
    } finally {
      setLoading(false);
    }
  };

  const [isUnlocking, setIsUnlocking] = useState(false);

  const currentYear = new Date().getFullYear();
  const isBackdated = year < currentYear - 1;
  const isUnlocked = user?.unlocked_tax_years?.includes(year) || false;
  const requiresUnlock = isBackdated && !isUnlocked;

  const paystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || "user@example.com",
    amount: 5000 * 100, // ₦5,000 in kobo
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder',
  };

  const monnifyConfig = {
    amount: 5000,
    currency: "NGN",
    reference: (new Date()).getTime().toString(),
    customerFullName: business?.name || "Customer",
    customerEmail: user?.email || "user@example.com",
    apiKey: import.meta.env.VITE_MONNIFY_API_KEY || 'MK_TEST_PLACEHOLDER',
    contractCode: import.meta.env.VITE_MONNIFY_CONTRACT_CODE || '1234567890',
    paymentDescription: `Unlock Tax Report for ${year}`,
    isTestMode: business?.monnify_test_mode ?? (import.meta.env.VITE_MONNIFY_TEST_MODE?.toLowerCase() === 'true'),
  };

  const initializePaystack = usePaystackPayment(paystackConfig);

  const handleUnlockYear = async () => {
    if (!user) return;
    
    const onSuccess = async (reference: any) => {
      setIsUnlocking(true);
      try {
        const updatedYears = [...(user.unlocked_tax_years || []), year];
        await updateDoc(doc(db, 'users', user.id), {
          unlocked_tax_years: updatedYears
        });
        await recordBillingHistory(
          user.id,
          5000,
          `Unlock Tax Report for ${year}`,
          business?.payment_gateway || 'paystack',
          reference?.reference || reference?.transactionReference || 'unknown'
        );
        alert(`Payment successful! You have unlocked the Tax Report for ${year}.`);
      } catch (error: any) {
        alert(error.message);
      } finally {
        setIsUnlocking(false);
      }
    };

    const onClose = () => {
      alert('Payment cancelled.');
    };

    if (business?.payment_gateway === 'monnify') {
      window.MonnifySDK?.initialize({
        ...monnifyConfig,
        onComplete: onSuccess,
        onClose: onClose
      });
    } else {
      initializePaystack({ onSuccess, onClose });
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Nigeria Tax Estimator</h3>
          <p className="text-stone-400 text-sm">Guided annual tax estimation based on current laws</p>
        </div>
        <select 
          className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-xs font-bold outline-none shadow-sm"
          value={year}
          onChange={e => { setYear(parseInt(e.target.value)); setEstimate(''); }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {requiresUnlock ? (
        <div className="text-center py-12 space-y-6">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield size={40} />
          </div>
          <h4 className="text-2xl font-bold text-stone-900">Unlock {year} Tax Report</h4>
          <p className="text-stone-500 max-w-md mx-auto">
            Your current plan covers the most recent financial year. To generate and auto-calculate a backdated Tax Report for {year}, a one-time preparation fee is required.
          </p>
          <div className="bg-stone-50 p-6 rounded-2xl inline-block text-left border border-stone-100 mb-6">
            <p className="text-xs text-stone-400 uppercase tracking-widest font-bold mb-2">One-time fee</p>
            <p className="text-4xl font-bold text-stone-900">₦5,000</p>
            <p className="text-xs text-stone-500 mt-2">Includes auto-calculation of {year} tax estimates.</p>
          </div>
          <div>
            <button 
              onClick={handleUnlockYear}
              disabled={isUnlocking}
              className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
            >
              {isUnlocking ? 'Processing Payment...' : `Pay ₦5,000 to Unlock ${year}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
            <h4 className="font-bold text-sm text-stone-400 uppercase tracking-widest mb-6">Tax Profile</h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Tax Type</label>
                <select 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={taxType}
                  onChange={e => setTaxType(e.target.value)}
                >
                  <option value="both">Comprehensive (CIT, VAT & PAYE)</option>
                  <option value="cit">Company Income Tax (CIT) & TETFund Only</option>
                  <option value="vat">Value Added Tax (VAT) Only</option>
                  <option value="paye">Pay As You Earn (PAYE) Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Business Type</label>
                <select 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={businessType}
                  onChange={e => setBusinessType(e.target.value)}
                >
                  <option>Small Company (Turnover &lt; ₦25m)</option>
                  <option>Medium Company (Turnover ₦25m - ₦100m)</option>
                  <option>Large Company (Turnover &gt; ₦100m)</option>
                  <option>Sole Proprietorship / Partnership</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Number of Employees</label>
                <input 
                  type="number"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={employees}
                  onChange={e => setEmployees(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Avg Monthly Salary (₦)</label>
                <input 
                  type="number"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={avgSalary}
                  onChange={e => setAvgSalary(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">State of Operation</label>
                <input 
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={state}
                  onChange={e => setState(e.target.value)}
                />
              </div>

              <div className="pt-4 border-t border-stone-100">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-400">Annual Turnover</span>
                  <span className="font-bold">₦{annualTurnover.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-400">Annual Profit</span>
                  <span className="font-bold">₦{annualProfit.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={generateEstimate}
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            {loading ? 'Calculating...' : 'Generate Tax Estimate'}
          </button>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm min-h-[500px]">
            {error ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
                  <AlertCircle size={32} />
                </div>
                <h5 className="font-bold text-stone-900 mb-2">Error Generating Estimate</h5>
                <p className="text-red-500 text-sm max-w-md">{error}</p>
              </div>
            ) : estimate ? (
              <div className="flex flex-col h-full">
                <div className="flex justify-end gap-2 mb-4 pb-4 border-b border-stone-100">
                  <button 
                    onClick={handlePrintReport}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                  <button 
                    onClick={handleDownloadReport}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Download size={16} />
                    {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                  </button>
                </div>
                <div id="tax-report-content" ref={reportRef} className="prose prose-stone prose-sm max-w-none bg-white p-8 rounded-xl">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{estimate}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center text-stone-300 mb-4">
                  <Scale size={32} />
                </div>
                <h5 className="font-bold text-stone-900 mb-2">No Estimate Generated</h5>
                <p className="text-stone-400 text-sm max-w-xs">Fill in your tax profile and click the button to get an AI-powered estimate based on Nigerian tax laws.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// --- Subscription Gate Component ---
function SubscriptionGate({ title, description, requiredTier, onUpgrade }: { title: string, description: string, requiredTier: 'basic' | 'pro', onUpgrade: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] bg-white rounded-3xl border border-stone-200 shadow-sm p-12 text-center">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-6">
        <Lock size={40} />
      </div>
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="text-stone-500 max-w-md mb-8">{description}</p>
      
      <div className="bg-emerald-900 text-white p-8 rounded-3xl max-w-lg w-full shadow-xl shadow-emerald-100">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={20} className="text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Premium Feature</span>
        </div>
        <h4 className="text-xl font-bold mb-4">Unlock BizPulse {requiredTier === 'pro' ? 'Pro' : 'Basic'}</h4>
        <ul className="text-left space-y-3 mb-8 text-emerald-100 text-sm">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            {requiredTier === 'pro' ? 'Advanced AI Tax Expert' : 'Weekly & Monthly Reports'}
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            {requiredTier === 'pro' ? 'Annual Returns Guidance' : 'AI Financial Advice'}
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Unlimited Transaction History
          </li>
        </ul>
        <button 
          onClick={onUpgrade}
          className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-950/20"
        >
          View Subscription Plans
        </button>
      </div>
    </div>
  );
}

// --- Settings Component ---
function SettingsView({ user, business, onUpdate, onNavigate }: { user: User | null, business: BusinessInfo | null, onUpdate: () => void, onNavigate: (tab: any) => void }) {
  const [name, setName] = useState(business?.name || '');
  const [rcNumber, setRcNumber] = useState(business?.rc_number || '');
  const [phoneNumber, setPhoneNumber] = useState(business?.phone_number || '');
  const [emailAddress, setEmailAddress] = useState(business?.email_address || '');
  const [businessAddress, setBusinessAddress] = useState(business?.address || '');
  const [natureOfBusiness, setNatureOfBusiness] = useState(business?.nature_of_business || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [userPhoto, setUserPhoto] = useState<File | null>(null);
  const [pin, setPin] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [paymentGateway, setPaymentGateway] = useState<'paystack' | 'monnify'>(business?.payment_gateway || 'paystack');
  const [monnifyTestMode, setMonnifyTestMode] = useState<boolean>(business?.monnify_test_mode ?? true);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, 'users', user.id, 'billing_history'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBillingHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user?.id]);



  const handleSetPin = async () => {
    if (!pin || pin.length < 4) {
      alert("PIN must be at least 4 digits");
      return;
    }
    setIsSettingPin(true);
    try {
      const res = await apiFetch('/api/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        alert("Security PIN set successfully!");
        setPin('');
        onUpdate();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      alert("Failed to set PIN: " + error.message);
    } finally {
      setIsSettingPin(false);
    }
  };



  const handleSave = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    if (!name.trim()) {
      alert("Business Name is required.");
      return;
    }

    if (!phoneNumber.trim()) {
      alert("Phone Number is required.");
      return;
    }

    let logo_url = business?.logo_url || null;
    let user_photo_url = business?.user_photo_url || null;

    if (logo) {
      try {
        const dataUrl = await compressImage(logo);
        logo_url = dataUrl;
      } catch (err) {
        console.error("Logo upload failed", err);
      }
    }

    if (userPhoto) {
      try {
        const dataUrl = await compressImage(userPhoto);
        user_photo_url = dataUrl;
      } catch (err) {
        console.error("User photo upload failed", err);
      }
    }

    await setDoc(doc(db, 'users', userId, 'business_info', 'info'), {
      name,
      rc_number: rcNumber,
      phone_number: phoneNumber,
      email_address: emailAddress,
      address: businessAddress,
      nature_of_business: natureOfBusiness,
      logo_url,
      user_photo_url,
      is_subscribed: business?.is_subscribed || 0,
      payment_gateway: paymentGateway,
      monnify_test_mode: monnifyTestMode
    }, { merge: true });

    // Also attempt global registration if RC number is provided
    if (rcNumber) {
      try {
        await apiFetch('/api/business/manual-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            registration_number: rcNumber,
            business_type: 'Business Name',
            address: '',
            registration_date: ''
          })
        });
      } catch (e) {
        // Ignore errors if already exists or other issues, we primary care about user profile save
        console.log("Global registration skipped or failed:", e);
      }
    }
    
    onUpdate();
    alert('Settings saved!');
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="font-bold text-lg mb-8">Business Profile</h3>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-20 h-20 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-300 overflow-hidden border-2 border-stone-100 group-hover:border-emerald-500 transition-all">
                  {business?.logo_url ? (
                    <img src={business.logo_url} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Upload size={24} />
                  )}
                </div>
                <input 
                  type="file" 
                  onChange={e => setLogo(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <div>
                <h4 className="font-bold text-xs mb-1">Business Logo</h4>
                <p className="text-[10px] text-stone-400">Company branding</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center text-stone-300 overflow-hidden border-2 border-stone-100 group-hover:border-emerald-500 transition-all">
                  {business?.user_photo_url ? (
                    <img src={business.user_photo_url} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={24} />
                  )}
                </div>
                <input 
                  type="file" 
                  onChange={e => setUserPhoto(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <div>
                <h4 className="font-bold text-xs mb-1">User Photo</h4>
                <p className="text-[10px] text-stone-400">Personal profile picture</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Business Name <span className="text-rose-500">*</span></label>
              <input 
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Official Business Name"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Phone Number <span className="text-rose-500">*</span></label>
              <input 
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="e.g. +234 800 000 0000"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Email Address</label>
              <input 
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={emailAddress}
                onChange={e => setEmailAddress(e.target.value)}
                placeholder="business@example.com"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">RC / BN Number</label>
              <input 
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={rcNumber}
                onChange={e => setRcNumber(e.target.value)}
                placeholder="e.g. RC 1234567"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Business Address / Location</label>
            <input 
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
              value={businessAddress}
              onChange={e => setBusinessAddress(e.target.value)}
              placeholder="Full physical address"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Nature of Business</label>
            <textarea 
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              value={natureOfBusiness}
              onChange={e => setNatureOfBusiness(e.target.value)}
              placeholder="e.g. General Merchandise, IT Consulting, Retail"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Active Payment Gateway</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPaymentGateway('paystack')}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all text-left",
                  paymentGateway === 'paystack' 
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" 
                    : "border-stone-100 bg-stone-50 hover:border-stone-200"
                )}
              >
                <div className="font-bold text-sm mb-1">Paystack</div>
                <div className="text-[10px] text-stone-400">Card, Bank, USSD, Transfer</div>
              </button>
              <button
                onClick={() => setPaymentGateway('monnify')}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all text-left",
                  paymentGateway === 'monnify' 
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" 
                    : "border-stone-100 bg-stone-50 hover:border-stone-200"
                )}
              >
                <div className="font-bold text-sm mb-1">Monnify</div>
                <div className="text-[10px] text-stone-400">Bank Transfer, Card, USSD</div>
              </button>
            </div>
            {paymentGateway === 'monnify' && (
              <div className="mt-4 flex items-center gap-3 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div 
                  className={cn(
                    "w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors",
                    monnifyTestMode ? "bg-emerald-500" : "bg-stone-300"
                  )}
                  onClick={() => setMonnifyTestMode(!monnifyTestMode)}
                >
                  <div className={cn(
                    "w-4 h-4 bg-white rounded-full shadow-sm transition-transform",
                    monnifyTestMode ? "translate-x-4" : "translate-x-0"
                  )} />
                </div>
                <div>
                  <div className="text-sm font-bold text-stone-800">Monnify Test Mode</div>
                  <div className="text-[10px] text-stone-500">Enable this to test payments without real money.</div>
                </div>
              </div>
            )}
            <p className="mt-2 text-[10px] text-stone-400 italic">Switch gateways based on your current configuration status.</p>
          </div>

          <button 
            onClick={handleSave}
            className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="font-bold text-lg mb-2">Security PIN</h3>
        <p className="text-stone-400 text-sm mb-6">
          {user?.hasPin 
            ? "Your security PIN is active. It will be required for sensitive actions like deletions." 
            : "Set a security PIN to authorize sensitive actions like deleting entries."}
        </p>
        
        <div className="flex gap-4 max-w-md">
          <input 
            type="password"
            placeholder={user?.hasPin ? "Enter new PIN" : "Set 4-digit PIN"}
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button 
            onClick={handleSetPin}
            disabled={isSettingPin}
            className="bg-stone-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {isSettingPin ? "Saving..." : user?.hasPin ? "Update PIN" : "Set PIN"}
          </button>
        </div>
      </div>

      <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100">
        <h3 className="font-bold text-emerald-900 text-lg mb-2">Subscription Management</h3>
        <p className="text-emerald-600 text-sm mb-6">
          {user?.subscription_tier !== 'free' 
            ? `You are currently on the ${user?.subscription_tier} plan. Thank you for your support!` 
            : "Unlock advanced reports, AI advice, and tax estimation with a premium plan."}
        </p>
        <button 
          onClick={() => onNavigate('subscription')}
          className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
        >
          Manage Subscription
        </button>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="font-bold text-lg mb-6">Billing History</h3>
        {billingHistory.length === 0 ? (
          <p className="text-stone-500 text-sm">No billing history found.</p>
        ) : (
          <div className="space-y-4">
            {billingHistory.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 border border-stone-100 rounded-2xl bg-stone-50">
                <div>
                  <div className="font-bold text-stone-900">{record.description}</div>
                  <div className="text-xs text-stone-500 mt-1">
                    {format(parseISO(record.date), 'MMM d, yyyy h:mm a')} • {record.gateway} • Ref: {record.reference}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600">₦{record.amount.toLocaleString()}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mt-1">{record.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-rose-50 p-8 rounded-3xl border border-rose-100">
        <h3 className="font-bold text-rose-900 text-lg mb-2">Danger Zone</h3>
        <p className="text-rose-600 text-sm mb-6">Resetting your data will permanently delete all transactions and inventory items.</p>
        <button className="bg-rose-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-rose-700 transition-all">
          Reset All Data
        </button>
      </div>

      {(user?.role === 'admin' || user?.email?.toLowerCase() === 'haddoyframes@gmail.com') && (
        <div className="bg-blue-50 p-8 rounded-3xl border border-blue-100">
          <h3 className="font-bold text-blue-900 text-lg mb-2">Export Project</h3>
          <p className="text-blue-600 text-sm mb-6">Download the complete source code of this application as a ZIP file.</p>
          <a 
            href="/api/download-source"
            download="bizpulse-source.zip"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
          >
            <Download size={18} />
            Download Source Code (ZIP)
          </a>
        </div>
      )}
    </div>
  );
}

// --- Subscription Component ---
// --- AI Advisor Component ---
function AIAdvisorView({ user, transactions, business }: { user: User | null, transactions: Transaction[], business: BusinessInfo | null }) {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');

  const generateInsights = async (customQuestion?: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/ai/business-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          businessName: business?.name,
          transactions: transactions.slice(0, 20),
          customQuestion
        })
      });

      if (!response.ok) {
        let errMsg = 'Failed to generate insights';
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      setInsights(data.insights);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating insights.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">AI Business Advisor</h2>
          <p className="text-stone-500">Personalized insights based on your transaction history</p>
        </div>
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
          <Brain size={24} />
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div className="flex gap-4">
          <input 
            type="text"
            placeholder="Ask a specific question about your finances..."
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateInsights(question)}
          />
          <button 
            onClick={() => generateInsights(question)}
            disabled={loading}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>

        <div className="flex justify-center">
          <button 
            onClick={() => { setQuestion(''); generateInsights(); }}
            disabled={loading}
            className="text-emerald-600 font-bold text-sm hover:underline"
          >
            Or generate general business insights
          </button>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-sm border border-rose-100">
            {error}
          </div>
        )}

        {insights && (
          <div className="mt-8 p-6 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="flex items-center gap-2 mb-4 text-emerald-700 font-bold">
              <Sparkles size={20} />
              <h3>AI Insights</h3>
            </div>
            <div className="prose prose-stone max-w-none text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{insights}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Subscription({ user, business, onUpdate }: { user: User | null, business: BusinessInfo | null, onUpdate: () => Promise<void> }) {
  const [promoCode, setPromoCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const basePaystackConfig = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || "user@example.com",
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder',
  };

  const initBasicPayment = usePaystackPayment({ ...basePaystackConfig, amount: 2000 * 100 });
  const initProPayment = usePaystackPayment({ ...basePaystackConfig, amount: 5000 * 100 });

  const monnifyBaseConfig = {
    currency: "NGN",
    customerFullName: business?.name || "Customer",
    customerEmail: user?.email || "user@example.com",
    apiKey: import.meta.env.VITE_MONNIFY_API_KEY || 'MK_TEST_PLACEHOLDER',
    contractCode: import.meta.env.VITE_MONNIFY_CONTRACT_CODE || '1234567890',
    isTestMode: business?.monnify_test_mode ?? (import.meta.env.VITE_MONNIFY_TEST_MODE?.toLowerCase() === 'true'),
  };

  const handleApplyPromo = async () => {
    if (!promoCode) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/subscription/promo', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Successfully upgraded to ${data.tier} tier!` });
        await onUpdate();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to apply promo code' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Connection error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async (tier: 'basic' | 'pro') => {
    const onSuccess = async (reference: any) => {
      setIsSubmitting(true);
      setMessage(null);
      try {
        const res = await apiFetch('/api/subscription/upgrade', {
          method: 'POST',
          body: JSON.stringify({ tier })
        });
        if (res.ok) {
          await recordBillingHistory(
            user!.id,
            tier === 'basic' ? 2000 : 5000,
            `Upgrade to ${tier} tier`,
            business?.payment_gateway || 'paystack',
            reference?.reference || reference?.transactionReference || 'unknown'
          );
          setMessage({ type: 'success', text: `Successfully upgraded to ${tier} tier!` });
          await onUpdate();
        } else {
          const data = await res.json();
          setMessage({ type: 'error', text: data.error || 'Failed to upgrade' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Connection error' });
      } finally {
        setIsSubmitting(false);
      }
    };

    const onClose = () => {
      setMessage({ type: 'error', text: 'Payment cancelled.' });
    };

    if (business?.payment_gateway === 'monnify') {
      window.MonnifySDK?.initialize({
        ...monnifyBaseConfig,
        amount: tier === 'basic' ? 2000 : 5000,
        reference: (new Date()).getTime().toString(),
        paymentDescription: `Upgrade to ${tier} tier`,
        onComplete: onSuccess,
        onClose: onClose
      });
    } else {
      if (tier === 'basic') {
        initBasicPayment({ onSuccess, onClose });
      } else {
        initProPayment({ onSuccess, onClose });
      }
    }
  };

  const currentTier = user?.subscription_tier || 'free';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold tracking-tight">Subscription Plans</h2>
        <p className="text-stone-500">Choose the plan that fits your business needs.</p>
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-2xl text-sm font-medium",
          message.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
        )}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Free Plan */}
        <div className={cn(
          "bg-white p-8 rounded-3xl border transition-all",
          currentTier === 'free' ? "border-stone-900 ring-1 ring-stone-900 shadow-xl" : "border-stone-200 shadow-sm"
        )}>
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-1">Free</h3>
            <p className="text-stone-400 text-xs">Basic tracking</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-bold">₦0</span>
            <span className="text-stone-400 text-sm">/mo</span>
          </div>
          <ul className="space-y-4 mb-8 text-sm text-stone-600">
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              Daily Dashboard
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              Inventory Management
            </li>
            <li className="flex items-center gap-2 text-stone-300 line-through">
              <Lock size={14} />
              AI Financial Advice
            </li>
          </ul>
          <button 
            disabled={currentTier === 'free'}
            className="w-full py-3 rounded-xl font-bold border border-stone-200 text-stone-400 disabled:opacity-50"
          >
            {currentTier === 'free' ? 'Current Plan' : 'Free Tier'}
          </button>
        </div>

        {/* Basic Plan */}
        <div className={cn(
          "bg-white p-8 rounded-3xl border transition-all",
          currentTier === 'basic' ? "border-emerald-600 ring-1 ring-emerald-600 shadow-xl" : "border-stone-200 shadow-sm"
        )}>
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-1">Basic</h3>
            <p className="text-stone-400 text-xs">For growing businesses</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-bold">₦3,000</span>
            <span className="text-stone-400 text-sm">/mo</span>
          </div>
          <ul className="space-y-4 mb-8 text-sm text-stone-600">
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              Everything in Free
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              Weekly & Monthly Reports
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              AI Financial Advice
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              Tax Estimator
            </li>
          </ul>
          <button 
            onClick={() => handleUpgrade('basic')}
            disabled={isSubmitting || currentTier === 'basic'}
            className={cn(
              "w-full py-3 rounded-xl font-bold transition-all",
              currentTier === 'basic' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100"
            )}
          >
            {currentTier === 'basic' ? 'Current Plan' : 'Upgrade to Basic'}
          </button>
        </div>

        {/* Pro Plan */}
        <div className={cn(
          "bg-emerald-900 text-white p-8 rounded-3xl border transition-all",
          currentTier === 'pro' ? "border-emerald-400 ring-1 ring-emerald-400 shadow-xl" : "border-emerald-800 shadow-sm"
        )}>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold">Pro</h3>
              <span className="bg-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Best Value</span>
            </div>
            <p className="text-emerald-400 text-xs">Complete business toolkit</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-bold">₦5,000</span>
            <span className="text-emerald-400 text-sm">/mo</span>
          </div>
          <ul className="space-y-4 mb-8 text-sm text-emerald-100">
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-400" />
              Everything in Basic
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-400" />
              AI Tax Expert (Nigeria)
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="text-emerald-400" />
              Annual Returns Guidance
            </li>
          </ul>
          <button 
            onClick={() => handleUpgrade('pro')}
            disabled={isSubmitting || currentTier === 'pro'}
            className={cn(
              "w-full py-3 rounded-xl font-bold transition-all",
              currentTier === 'pro' ? "bg-emerald-800 text-emerald-300 border border-emerald-700" : "bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-950/20"
            )}
          >
            {currentTier === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
          </button>
        </div>
      </div>

      {/* Promo Code Section */}
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-stone-50 rounded-2xl text-stone-600">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Have a Promo Code?</h3>
            <p className="text-stone-400 text-sm">Enter your staff or gift code to unlock premium features.</p>
          </div>
        </div>
        
        <div className="flex gap-4 max-w-md">
          <input 
            type="text"
            placeholder="Enter Code (e.g. STAFF2026)"
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none font-bold uppercase tracking-widest"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value.toUpperCase())}
          />
          <button 
            onClick={handleApplyPromo}
            disabled={isSubmitting || !promoCode}
            className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Applying..." : "Apply Code"}
          </button>
        </div>
      </div>
    </div>
  );
}
