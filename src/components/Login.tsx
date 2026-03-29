import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Mail, Lock } from 'lucide-react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface LoginProps {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [error, setError] = useState<string | React.ReactNode>('');
  const [success, setSuccess] = useState<string | React.ReactNode>('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Check for pending verification modal on mount
  React.useEffect(() => {
    const pendingVerification = localStorage.getItem('pending_verification');
    const pendingEmail = localStorage.getItem('pending_verification_email');
    if (pendingVerification === 'true' && pendingEmail) {
      setEmail(pendingEmail);
      setShowVerificationModal(true);
      localStorage.removeItem('pending_verification');
      localStorage.removeItem('pending_verification_email');
    }
  }, []);

  const getErrorMessage = (err: any) => {
    console.error("Auth error:", err);
    const code = err.code;
    
    switch (code) {
      case 'auth/invalid-credential':
        return (
          <div className="flex flex-col gap-2">
            <p>{isSignUp ? 'Problem creating account. Please check your details.' : 'Invalid email or password.'}</p>
            {!isSignUp && (
              <button 
                type="button"
                onClick={() => { setIsSignUp(true); setError(''); setSuccess(''); }}
                className="text-xs font-bold underline text-left"
              >
                Need to create an account? Sign Up instead
              </button>
            )}
          </div>
        );
      case 'auth/email-already-in-use':
        return (
          <div className="flex flex-col gap-2">
            <p className="font-bold">Account already exists</p>
            <p>The email <span className="underline">{email}</span> is already registered. Would you like to sign in instead?</p>
            <div className="flex gap-4 mt-1">
              <button 
                type="button"
                onClick={() => { setIsSignUp(false); setError(''); setSuccess(''); }}
                className="text-xs font-bold underline text-emerald-700 hover:text-emerald-800"
              >
                Switch to Sign In
              </button>
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-bold underline text-emerald-700 hover:text-emerald-800"
              >
                Reset Password
              </button>
            </div>
          </div>
        );
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not enabled in Firebase Console.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
        return 'No account found with this email. Please Sign Up.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in popup was closed before completion.';
      case 'auth/cancelled-popup-request':
        return 'Only one popup request is allowed at a time.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      default:
        return err.message || 'An error occurred during authentication.';
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      onLogin(token);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        console.log("User created, sending verification email...");
        try {
          await sendEmailVerification(result.user);
          console.log("Verification email sent successfully.");
        } catch (verifyErr: any) {
          console.error("Failed to send verification email:", verifyErr);
          setError(`Account created, but we couldn't send the verification email. Error: ${verifyErr.message}. Please try signing in to resend it.`);
          setLoading(false);
          return;
        }
        await signOut(auth);
        localStorage.setItem('pending_verification', 'true');
        localStorage.setItem('pending_verification_email', email);
        setShowVerificationModal(true);
        setIsSignUp(false);
        setLoading(false);
        return;
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        if (!result.user.emailVerified) {
          await signOut(auth);
          setError(
            <div className="flex flex-col gap-2">
              <p>Please verify your email before signing in. Check your inbox for the verification link.</p>
              <button 
                type="button"
                onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await signInWithEmailAndPassword(auth, email, password);
                    await sendEmailVerification(res.user);
                    await signOut(auth);
                    setSuccess('Verification email resent! Please check your inbox.');
                    setError('');
                  } catch (err: any) {
                    setError(getErrorMessage(err));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="text-xs font-bold underline text-left"
              >
                Resend verification email
              </button>
            </div>
          );
          setLoading(false);
          return;
        }
        const token = await result.user.getIdToken();
        onLogin(token);
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setIsSignUp(false);
        setError('This email is already registered. Please sign in with your password.');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(`Password reset email sent to ${email}. Please check your inbox.`);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError('Failed to send password reset email: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 font-sans relative">
      {/* Verification Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-stone-100 text-center"
          >
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-6">
              <Mail size={40} />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Check your email!</h2>
            <p className="text-stone-600 mb-6 leading-relaxed">
              We've sent a verification link to <span className="font-bold text-stone-900 underline">{email}</span>. 
              Please click the link in the email to activate your account.
            </p>
            <div className="bg-stone-50 p-4 rounded-2xl mb-8 text-sm text-stone-500 italic">
              Don't see it? Check your spam folder!
            </div>
            <button 
              onClick={() => setShowVerificationModal(false)}
              className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
            >
              Got it, I'll check!
            </button>
          </motion.div>
        </div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-stone-100 w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 mb-4">
            <TrendingUp size={32} />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">BizPulse</h1>
          <p className="text-stone-500 text-sm mt-1">
            {isSignUp ? 'Create an account to get started' : 'Sign in to continue'}
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl mb-6 text-sm font-medium bg-red-50 text-red-600 border border-red-100"
          >
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 rounded-2xl mb-6 text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-100 shadow-sm shadow-emerald-100"
          >
            {success}
          </motion.div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>
          </div>
          {!isSignUp && (
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-bold text-emerald-600 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="relative flex items-center py-2 mb-6">
          <div className="flex-grow border-t border-stone-200"></div>
          <span className="flex-shrink-0 mx-4 text-stone-400 text-xs font-medium">OR</span>
          <div className="flex-grow border-t border-stone-200"></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          type="button"
          className="w-full flex items-center justify-center gap-3 bg-white border border-stone-200 text-stone-700 py-3.5 rounded-xl font-bold hover:bg-stone-50 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? 'Please wait...' : 'Continue with Google'}
        </button>

        <div className="mt-8 text-center">
          <p className="text-sm text-stone-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              className="text-emerald-600 font-bold hover:underline"
              type="button"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
