'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Zap,
  FileText,
  BadgeCheck,
  HelpCircle,
  X,
  CheckCircle2,
  Sparkles,
  Shield,
} from 'lucide-react';
import { RadiologyStore } from '@/lib/radiology-store';
import { ApiClient } from '@/lib/api-client';
import { TextInput } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Modals state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await ApiClient.login({ email: email.trim(), password });
      RadiologyStore.setSession(result.user);
      if (result.user.role === 'SUPER_ADMIN') {
        router.push('/dashboard/approvals');
      } else {
        router.push('/dashboard/all-reports');
      }
    } catch {
      // Ensure no mock/local session or JWT remains after a failed API login
      ApiClient.logout();
      RadiologyStore.logout();
      setLoading(false);
      setError('Invalid username or password. Please check your credentials.');
    }
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotSent(true);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col lg:flex-row overflow-y-auto font-sans text-slate-100 selection:bg-[#009ef7] selection:text-white">
      
      {/* LEFT HERO & SHOWCASE PANEL (DESKTOP ONLY - HIDDEN ON MOBILE/TABLET FOR ZERO SCROLLING) */}
      <div className="hidden lg:flex relative lg:w-6/12 bg-gradient-to-br from-[#080d1a] via-[#111c33] to-[#1F3864] p-10 xl:p-14 flex-col justify-between border-r border-slate-800/80 min-h-screen">
        {/* Background Radial Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#009ef7_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
        
        {/* Glow Spheres */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-[#009ef7]/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />

        {/* Top Header Identity */}
        <div className="relative z-10 flex items-center justify-between">
          <img src="/logo.png" alt="Radionlineofficial" className="h-16 w-auto" />

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-semibold text-emerald-400 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>PACS Live Telemetry</span>
          </div>
        </div>

        {/* Hero Content Section */}
        <div className="relative z-10 my-auto max-w-xl py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-full text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>High-Precision Medical Imaging</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Seamless Radiology Workstation & Cloud PACS
          </h1>
          <p className="mt-3 text-xs xl:text-sm text-slate-300 font-normal leading-relaxed">
            Instant DICOM study review, multi-modality contrast windowing, high-density reporting templates, and real-time radiologist sign-off.
          </p>

          {/* Feature Highlights Cards */}
          <div className="grid grid-cols-3 gap-3 mt-8">
            <div className="p-3.5 bg-slate-900/80 border border-slate-800/90 rounded-xl backdrop-blur-sm">
              <Zap className="w-4 h-4 text-cyan-400 mb-2" />
              <h4 className="font-bold text-xs text-white">Instant Viewer</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">DICOM stack windowing & tools</p>
            </div>

            <div className="p-3.5 bg-slate-900/80 border border-slate-800/90 rounded-lg backdrop-blur-sm">
              <FileText className="w-4 h-4 text-emerald-400 mb-2" />
              <h4 className="font-bold text-xs text-white">Smart Reporting</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Automated Findings & Letterhead</p>
            </div>

            <div className="p-3.5 bg-slate-900/80 border border-slate-800/90 rounded-lg backdrop-blur-sm">
              <BadgeCheck className="w-4 h-4 text-amber-400 mb-2" />
              <h4 className="font-bold text-xs text-white">Digital Signature</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Encrypted Specialist Approval</p>
            </div>
          </div>
        </div>

        {/* Footer Metrics */}
            <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3 text-xs">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted clinical workstation</span>
          </div>
        </div>
      </div>

      {/* RIGHT AUTH FORM PANEL (FULL WIDTH ON MOBILE, TALL CENTERING ON DESKTOP) */}
      <div className="lg:w-6/12 bg-white flex flex-col justify-between p-4 sm:p-8 lg:p-12 relative text-slate-900 min-h-screen">
        
        {/* Mobile Header Brand Bar (Visible only on Mobile & Tablet) */}
        <div className="lg:hidden flex items-center justify-between pb-6 mb-2 border-b border-slate-100">
          <img src="/logo.png" alt="Radionlineofficial" className="h-14 w-auto bg-black rounded-lg" />

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live System</span>
          </div>
        </div>

        {/* Main Auth Form Box */}
        <div className="max-w-md w-full mx-auto my-auto py-2 sm:py-6 space-y-6">
          
          {/* Form Header */}
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
              Sign In to Teleradiology Portal
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Enter your registered credentials to access PACS workstation & reports.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Username / Registered Email *
              </label>
              <TextInput
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter username or email address..."
                autoComplete="username"
                leftIcon={<Mail className="h-4 w-4" />}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Login Password *
                </label>
                <button
                  type="button"
                  onClick={() => setForgotPasswordOpen(true)}
                  className="text-[11px] font-semibold text-[#009ef7] hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <TextInput
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer text-slate-400 hover:text-slate-600"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 font-semibold">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-[#009ef7] rounded border-slate-300 focus:ring-[#009ef7]"
                />
                <span>Remember this device</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#009ef7] hover:bg-[#008be0] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In To Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Support Footer Link */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Need assistance?</span>
            <button
              type="button"
              onClick={() => setSupportModalOpen(true)}
              className="font-semibold text-[#009ef7] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Support Center
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-400 mt-6 font-mono pt-4 border-t border-slate-100">
          © {new Date().getFullYear()} Radionline Teleradiology Systems. All rights reserved.
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 w-full max-w-md rounded-xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                Reset Password
              </h3>
              <button type="button" onClick={() => setForgotPasswordOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {forgotSent ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Reset instructions sent to {forgotEmail}!</span>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">Registered Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter email address..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#009ef7]"
                />
                <button type="submit" className="w-full py-2 bg-[#009ef7] text-white font-bold text-xs rounded-lg hover:bg-[#008be0] transition-colors cursor-pointer">
                  Send Reset Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SUPPORT MODAL */}
      {supportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 w-full max-w-md rounded-xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                System Support & PACS Info
              </h3>
              <button type="button" onClick={() => setSupportModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sky-800 font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Sign-in is authenticated by the server. Accounts are created by an administrator.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 text-slate-700">
                <div className="font-bold text-slate-900 mb-1">Administrator support</div>
                <div>Contact your organization administrator for account access.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
