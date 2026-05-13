import React from 'react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  BarChart3, 
  Package, 
  Users, 
  FileText, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  Smartphone,
  CheckCircle2,
  BrainCircuit,
  Calculator,
  LayoutDashboard,
  Lock
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [activePlan, setActivePlan] = React.useState<'free' | 'basic' | 'pro'>('basic');

  return (
    <div className="min-h-screen bg-white font-sans text-stone-900 overflow-x-hidden scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-stone-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <BarChart3 size={20} />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight">BizPulse</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-8 text-[11px] sm:text-sm font-bold sm:font-medium text-stone-500 sm:text-stone-600">
            <a href="#features" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Features</a>
            <a href="#benefits" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Benefits</a>
            <a href="#pricing" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Pricing</a>
          </div>
          <button 
            onClick={onGetStarted}
            className="bg-emerald-600 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
              <Zap size={14} />
              <span>Smart Business Management for Nigeria</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter leading-[1.1] mb-6">
              Track your business <span className="text-emerald-600">with precision.</span>
            </h1>
            <p className="text-lg text-stone-600 mb-10 leading-relaxed max-w-xl">
              Automate your inventory, generate CAC reports in seconds, and get AI-powered advice tailored to the Nigerian market.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={onGetStarted}
                className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
              >
                Start 14-Day Free Trial
                <ArrowRight size={20} />
              </button>
              <div className="flex items-center gap-4 px-2">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-stone-200 overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" />
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-bold text-stone-900">500+ Businesses</p>
                  <p className="text-stone-500">Already scaled with BizPulse</p>
                </div>
              </div>
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Desktop Mockup */}
            <div className="relative z-10 bg-stone-900 rounded-[2rem] p-3 shadow-2xl border border-stone-800 ml-auto w-full max-w-2xl overflow-hidden group">
              <div className="bg-white rounded-xl overflow-hidden aspect-[16/10] flex flex-col">
                {/* Browser Header */}
                <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-4">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="bg-stone-200 h-4 w-48 rounded-full" />
                </div>
                
                {/* App UI */}
                <div className="flex-1 p-6 overflow-hidden">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-xl font-bold text-stone-900">Transaction Review</h3>
                      <p className="text-xs text-stone-400">Total volume this month: ₦2,450,000</p>
                    </div>
                    <div className="flex gap-2">
                       <div className="w-24 h-8 bg-stone-100 rounded-lg border border-stone-200" />
                       <div className="w-8 h-8 bg-emerald-600 rounded-lg" />
                    </div>
                  </div>

                  {/* Graph Concept */}
                  <div className="h-32 w-full bg-emerald-50 rounded-2xl mb-6 relative overflow-hidden p-4">
                    <div className="absolute inset-0 flex items-end px-4 gap-2">
                      {[40, 70, 45, 90, 65, 80, 55, 75, 50, 85].map((h, i) => (
                        <motion.div 
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 0.5 + (i * 0.1) }}
                          className="flex-1 bg-emerald-500/20 rounded-t-sm relative group/bar"
                        >
                          <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </motion.div>
                      ))}
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                       <div className="flex justify-between text-[10px] font-bold text-emerald-700">
                          <span>Revenue Trend</span>
                          <span className="bg-emerald-100 px-2 py-0.5 rounded">+12.5%</span>
                       </div>
                    </div>
                  </div>

                  {/* Transaction List */}
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-stone-200" />
                          <div>
                            <div className="h-2 w-24 bg-stone-300 rounded-full mb-1" />
                            <div className="h-2 w-16 bg-stone-200 rounded-full" />
                          </div>
                        </div>
                        <div className="h-3 w-12 bg-emerald-100 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Mockup */}
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="absolute -bottom-10 -left-6 z-20 w-48 shadow-2xl"
            >
              <div className="bg-stone-900 rounded-[2.5rem] p-2.5 border border-stone-800 overflow-hidden">
                <div className="bg-white rounded-[2rem] aspect-[9/19] overflow-hidden flex flex-col">
                  {/* Notch */}
                  <div className="h-6 w-full flex justify-center pt-1">
                    <div className="w-16 h-3 bg-stone-100 rounded-full" />
                  </div>
                  
                  <div className="flex-1 p-4">
                    <div className="text-center mb-6">
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Dashboard</p>
                      <h4 className="font-bold text-stone-900">Overview</h4>
                    </div>

                    {/* Pie Chart Concept */}
                    <div className="aspect-square w-full relative flex items-center justify-center mb-6">
                      <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                        <circle cx="50" cy="50" r="40" stroke="#f1f5f9" strokeWidth="12" fill="none" />
                        <motion.circle 
                          cx="50" cy="50" r="40" 
                          stroke="#10b981" strokeWidth="12" 
                          fill="none" 
                          strokeDasharray="251"
                          initial={{ strokeDashoffset: 251 }}
                          animate={{ strokeDashoffset: 60 }}
                          transition={{ delay: 1, duration: 1.5 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs font-bold">75%</span>
                        <span className="text-[8px] text-stone-400 uppercase">Target</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-6">
                       <div className="p-2 bg-emerald-50 rounded-xl">
                          <div className="h-1 w-6 bg-emerald-200 rounded-full mb-1" />
                          <div className="h-3 w-10 bg-emerald-600 rounded-full" />
                       </div>
                       <div className="p-2 bg-stone-50 rounded-xl">
                          <div className="h-1 w-6 bg-stone-200 rounded-full mb-1" />
                          <div className="h-3 w-10 bg-stone-400 rounded-full" />
                       </div>
                    </div>

                    <button className="w-full py-2.5 bg-emerald-600 text-white text-[10px] font-bold rounded-xl shadow-lg shadow-emerald-100">
                      View All Reports
                    </button>
                  </div>

                  {/* Nav Bar */}
                  <div className="p-3 border-t border-stone-100 flex justify-around">
                     <div className="w-4 h-4 bg-emerald-600 rounded" />
                     <div className="w-4 h-4 bg-stone-100 rounded" />
                     <div className="w-4 h-4 bg-stone-100 rounded" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Decorative background pulse */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-emerald-400/5 rounded-full blur-3xl -z-10" />
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-stone-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-bold tracking-tight mb-4">Everything you need to grow.</h2>
            <p className="text-stone-500">Powerful tools designed specifically for the modern entrepreneur.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Package className="text-emerald-600" size={28} />}
              title="Inventory Tracking"
              description="Monitor stock levels in real-time. Get low-stock alerts and manage variants across multiple locations."
            />
            <FeatureCard 
              icon={<Zap className="text-emerald-600" size={28} />}
              title="Smart Transactions"
              description="Record sales and expenses effortlessly. Automated receipt generation and daily performance snapshots."
            />
            <FeatureCard 
              icon={<FileText className="text-emerald-600" size={28} />}
              title="CAC Annual Reports"
              description="Generate your provisional CAC Annual Return documents automatically with pre-calculated financials."
            />
            <FeatureCard 
              icon={<Calculator className="text-emerald-600" size={28} />}
              title="Nigerian Tax Expert"
              description="Estimate your VAT and annual taxes according to current FIRS regulations and laws."
            />
            <FeatureCard 
              icon={<BrainCircuit className="text-emerald-600" size={28} />}
              title="AI Business Advisor"
              description="Leverage your data for personalized insights. Get AI recommendations on pricing, trends, and growth."
            />
            <FeatureCard 
              icon={<Smartphone className="text-emerald-600" size={28} />}
              title="Mobile First"
              description="Access your business data on the go. Optimized for low-bandwidth and entry-level smartphones."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-white px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-bold tracking-tight mb-4">Simple, transparent pricing.</h2>
            <p className="text-stone-500">Pick the plan that grows with your business. All plans start with a 14-day free trial.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Selection Highlight Component */}
            <div className="hidden md:block absolute inset-0 -z-10 pointer-events-none">
              <motion.div 
                layout
                initial={false}
                animate={{
                  x: activePlan === 'free' ? '0%' : activePlan === 'basic' ? '33.33%' : '66.66%',
                  width: '33.33%'
                }}
                className="h-full p-4"
              >
                <div className="w-full h-full rounded-[3rem] border-2 border-emerald-600 shadow-[0_0_40px_rgba(16,185,129,0.1)] bg-emerald-50/10" />
              </motion.div>
            </div>

            {/* Free Plan */}
            <div 
              id="plan-free"
              onClick={() => setActivePlan('free')}
              className={cn(
                "bg-stone-50 p-10 rounded-[2.5rem] border transition-all duration-500 cursor-pointer flex flex-col relative",
                activePlan === 'free' ? "border-emerald-600 shadow-2xl z-20 scale-[1.02]" : "border-stone-200 hover:border-emerald-200"
              )}
            >
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">Free</h3>
                <p className="text-stone-500 text-sm">Perfect for hobbyists</p>
              </div>
              <div className="mb-8 items-baseline flex gap-1">
                <span className="text-5xl font-extrabold tracking-tight">₦0</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <ul className="space-y-4 mb-12 flex-1">
                <PricingFeature text="Daily Dashboard" />
                <PricingFeature text="Inventory Management" />
                <PricingFeature text="Basic Transactions" />
                <PricingFeature text="Customer Records" />
                <PricingFeature text="AI Advisor" disabled />
                <PricingFeature text="FIRS Tax Estimator" disabled />
              </ul>
              <div className="mt-auto space-y-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); onGetStarted(); }}
                  className="w-full py-4 bg-white border border-stone-200 text-stone-900 font-bold rounded-2xl hover:bg-stone-100 transition-all shadow-sm"
                >
                  Start for Free
                </button>
              </div>
            </div>

            {/* Basic Plan */}
            <div 
              id="plan-basic"
              onClick={() => setActivePlan('basic')}
              className={cn(
                "bg-white p-10 rounded-[2.5rem] border transition-all duration-500 cursor-pointer flex flex-col relative shadow-emerald-100",
                activePlan === 'basic' ? "border-emerald-600 shadow-2xl z-20 scale-[1.02]" : "border-stone-200 hover:border-emerald-200"
              )}
            >
              <div className="absolute top-0 right-10 -translate-y-1/2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-200">
                Most Popular
              </div>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">Basic</h3>
                <p className="text-stone-500 text-sm">Professional tracking</p>
              </div>
              <div className="mb-8 items-baseline flex gap-1">
                <span className="text-5xl font-extrabold tracking-tight">₦3,000</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <ul className="space-y-4 mb-12 flex-1">
                <PricingFeature text="Everything in Free" />
                <PricingFeature text="Weekly/Monthly Reports" />
                <PricingFeature text="AI Financial Advice" />
                <PricingFeature text="FIRS Tax Estimator" />
                <PricingFeature text="Performance Analytics" />
                <PricingFeature text="CAC Filings" disabled />
              </ul>
              <div className="mt-auto space-y-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); onGetStarted(); }}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
                >
                  Start Basic Trial
                </button>
              </div>
            </div>

            {/* Pro Plan */}
            <div 
              id="plan-pro"
              onClick={() => setActivePlan('pro')}
              className={cn(
                "p-10 rounded-[2.5rem] border transition-all duration-500 cursor-pointer flex flex-col relative",
                activePlan === 'pro' ? "bg-stone-900 text-white border-emerald-600 shadow-2xl z-20 scale-[1.02]" : "bg-stone-900 border-stone-800 text-white opacity-90 hover:opacity-100"
              )}
            >
              <div className="absolute top-0 right-10 -translate-y-1/2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-200">
                Enterprise Choice
              </div>
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">Pro</h3>
                <p className="text-stone-400 text-sm">Full power enterprise</p>
              </div>
              <div className="mb-8 items-baseline flex gap-1">
                <span className="text-5xl font-extrabold tracking-tight">₦5,000</span>
                <span className="text-stone-400 font-medium">/mo</span>
              </div>
              <ul className="space-y-4 mb-12 flex-1">
                <PricingFeature text="Everything in Basic" dark />
                <PricingFeature text="Performance Analytics" dark />
                <PricingFeature text="CAC Annual Returns" dark />
                <PricingFeature text="Advanced AI Advisor" dark />
                <PricingFeature text="Priority Cloud Support" dark />
                <PricingFeature text="Custom Branding" dark />
              </ul>
              <div className="mt-auto space-y-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); onGetStarted(); }}
                  className="w-full py-4 bg-white text-stone-900 font-bold rounded-2xl hover:bg-stone-100 transition-all shadow-xl shadow-white/10"
                >
                  Get Started Pro
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-32 px-6">
        <div className="max-w-7xl mx-auto overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1 lg:pr-10">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative rounded-[3rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-stone-100 bg-stone-50 group aspect-video lg:aspect-[4/3]"
              >
                <img 
                  src="https://images.unsplash.com/photo-1556740714-a439f322405d?q=80&w=1600&auto=format&fit=crop" 
                  alt="Professional boutique owner reviewing business analytics on a tablet" 
                  className="w-full h-full object-cover block transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://images.unsplash.com/photo-1556740758-90de374c12ad?q=80&w=1600&auto=format&fit=crop";
                    target.onerror = null;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                <div className="absolute bottom-8 left-8 right-8 p-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <p className="text-white text-sm font-medium">Real-time performance tracking at your fingertips.</p>
                </div>
              </motion.div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-4xl font-bold tracking-tight mb-8">Why BizPulse is different.</h2>
              <div className="space-y-8">
                <Benefit 
                  title="Local Relevance"
                  description="We understand NGN pricing, Nigerian tax laws (FIRS), and CAC requirements."
                />
                <Benefit 
                  title="Zero Manual Math"
                  description="Stop wasting hours on calculators. We automate all your profit, loss, and margin calculations."
                />
                <Benefit 
                  title="Data Security"
                  description="Your business information is encrypted and securely stored. Only you hold the access keys."
                />
                <Benefit 
                  title="14-Day Full Access Trial"
                  description="Try every single feature—including AI and Reports—completely free for two weeks."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-emerald-900 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-800 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-800 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl opacity-50" />
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-8">
            Ready to pulse your business up?
          </h2>
          <p className="text-emerald-100 text-lg mb-12 opacity-80 leading-relaxed">
            Join hundreds of Nigerian businesses streamlining their operations today. No credit card required to start your trial.
          </p>
          <button 
            onClick={onGetStarted}
            className="bg-white text-emerald-900 px-10 py-5 rounded-[2rem] font-bold text-xl hover:bg-emerald-50 transition-all shadow-2xl flex items-center justify-center gap-3 mx-auto"
          >
            Start Your Free Trial
            <Zap size={24} className="text-emerald-600" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-stone-100 bg-white px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
                <BarChart3 size={18} />
              </div>
              <span className="text-lg font-bold">BizPulse</span>
            </div>
            <p className="text-stone-500 max-w-sm mb-6">
              The ultimate business companion for Nigerian entrepreneurs. Simple, secure, and smart.
            </p>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-400 hover:text-emerald-600 cursor-pointer transition-colors">
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-stone-900 mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-stone-500">
              <li><a href="#features" className="hover:text-emerald-600">Features</a></li>
              <li><a href="#pricing" className="hover:text-emerald-600">Pricing</a></li>
              <li><a href="#" className="hover:text-emerald-600">Security</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-stone-900 mb-6">Support</h4>
            <ul className="space-y-4 text-sm text-stone-500">
              <li><a href="#" className="hover:text-emerald-600">Help Center</a></li>
              <li><a href="#" className="hover:text-emerald-600">Contact Us</a></li>
              <li><a href="#" className="hover:text-emerald-600">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-10 border-t border-stone-50 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-stone-400">© 2024 BizPulse Nigeria. All rights reserved.</p>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Secure Cloud Infrastructure</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="bg-white p-8 rounded-3xl border border-stone-200 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50 transition-all group">
    <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mb-6 border border-stone-100 group-hover:bg-emerald-50 transition-colors">
      {icon}
    </div>
    <h3 className="font-bold text-xl mb-3 text-stone-900">{title}</h3>
    <p className="text-stone-500 leading-relaxed text-sm">
      {description}
    </p>
  </div>
);

const Benefit = ({ title, description }: { title: string, description: string }) => (
  <div className="flex gap-4">
    <div className="mt-1 flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
      <CheckCircle2 size={14} />
    </div>
    <div>
      <h4 className="font-bold text-stone-900 mb-1">{title}</h4>
      <p className="text-stone-500 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

const PricingFeature = ({ text, disabled, dark }: { text: string, disabled?: boolean, dark?: boolean }) => (
  <li className={cn(
    "flex items-center gap-3 text-sm",
    disabled ? "opacity-30" : "opacity-100",
    dark ? "text-stone-300" : "text-stone-600"
  )}>
    <div className={cn(
      "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
      disabled ? (dark ? "bg-stone-800" : "bg-stone-100") : "bg-emerald-100 text-emerald-600"
    )}>
      {disabled ? (
        <Lock size={10} className={dark ? "text-stone-600" : "text-stone-400"} />
      ) : (
        <CheckCircle2 size={12} />
      )}
    </div>
    <span className={cn(disabled && "line-through")}>{text}</span>
  </li>
);
