'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'framer-motion'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  ShieldCheck,
  Activity,
  TrendingUp,
  FolderDown,
  Layers,
  ArrowRight,
  Terminal,
  Radio,
  CheckCircle2,
  Cpu,
} from 'lucide-react'
import { signInWithEmail, signInWithGoogle } from '@/lib/firebase/auth'
import { getFirebaseErrorMessage } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isEntering, setIsEntering] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Card cursor spotlight
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)

  // 3D Parallax & Tilt motion values
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  // Smooth springs for fluid, physics-based inertia
  const springConfig = { stiffness: 100, damping: 22, mass: 0.8 }
  const smoothX = useSpring(mouseX, springConfig)
  const smoothY = useSpring(mouseY, springConfig)

  // Card 3D Tilt
  const cardRotateX = useTransform(smoothY, [-1, 1], [4, -4])
  const cardRotateY = useTransform(smoothX, [-1, 1], [-5, 5])

  // Parallax layers for background decorative elements
  const layer1X = useTransform(smoothX, [-1, 1], [-18, 18])
  const layer1Y = useTransform(smoothY, [-1, 1], [-18, 18])
  const layer2X = useTransform(smoothX, [-1, 1], [22, -22])
  const layer2Y = useTransform(smoothY, [-1, 1], [-15, 15])
  const layer3X = useTransform(smoothX, [-1, 1], [-25, 25])
  const layer3Y = useTransform(smoothY, [-1, 1], [20, -20])
  const layer4X = useTransform(smoothX, [-1, 1], [20, -20])
  const layer4Y = useTransform(smoothY, [-1, 1], [18, -18])
  const ambientLightX = useTransform(smoothX, [-1, 1], [-40, 40])
  const ambientLightY = useTransform(smoothY, [-1, 1], [-30, 30])

  useEffect(() => {
    // Check touch devices and reduced-motion preferences
    const touch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches)
    setIsTouchDevice(!!touch)

    const motionQuery =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(motionQuery ? motionQuery.matches : false)

    if (touch || (motionQuery && motionQuery.matches)) return

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window
      const xRatio = (e.clientX / innerWidth - 0.5) * 2 // -1 to 1
      const yRatio = (e.clientY / innerHeight - 0.5) * 2 // -1 to 1
      mouseX.set(xRatio)
      mouseY.set(yRatio)

      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  })

  const onSubmit = async (data: LoginFormData) => {
    setAuthError('')
    try {
      const userCredential = await signInWithEmail(data.email, data.password)
      const idToken = await userCredential.user.getIdToken()
      document.cookie = `__session=${idToken}; path=/; ${
        data.rememberMe ? 'max-age=604800' : ''
      }`

      setIsEntering(true)
      setTimeout(() => {
        router.push(redirectTo)
      }, 750)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      setAuthError(getFirebaseErrorMessage(code))
    }
  }

  const handleGoogleLogin = async () => {
    setAuthError('')
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
      setIsEntering(true)
      // Hard navigation ensures __session cookie is properly recognized across SSR layouts
      setTimeout(() => {
        window.location.href = redirectTo || '/dashboard'
      }, 750)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      const message = (err as { message?: string }).message ?? ''

      if (code === 'auth/popup-closed-by-user') {
        // User cancelled popup — clean dismiss
      } else if (code === 'auth/unauthorized-admin') {
        setAuthError(message)
      } else {
        setAuthError(getFirebaseErrorMessage(code) || 'Failed to sign in with Google.')
      }
    } finally {
      setIsGoogleLoading(false)
    }
  }

  const isBusy = isSubmitting || isGoogleLoading || isEntering

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden bg-[#060811]">
      {/* ─── Immersive 3D Background Atmosphere ────────────────────────── */}
      {/* Ambient Grid Matrix */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(circle at center, black 40%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 85%)',
        }}
      />

      {/* Cybernetic Horizon / Top Light Beam */}
      <motion.div
        style={!isTouchDevice && !reducedMotion ? { x: ambientLightX, y: ambientLightY } : undefined}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[340px] bg-gradient-to-b from-indigo-500/20 via-cyan-500/10 to-transparent blur-3xl pointer-events-none rounded-full"
      />

      {/* Ambient Deep Radial Glows */}
      <motion.div
        animate={
          !reducedMotion
            ? {
                scale: [1, 1.08, 1],
                opacity: [0.12, 0.18, 0.12],
              }
            : undefined
        }
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={
          !reducedMotion
            ? {
                scale: [1, 1.12, 1],
                opacity: [0.1, 0.16, 0.1],
              }
            : undefined
        }
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-cyan-600/15 rounded-full blur-[130px] pointer-events-none"
      />

      {/* ─── Floating Dashboard Interface Elements (Realistic Placeholder Telemetry) ─ */}
      {/* 1. Top-Left: Financial & Invoicing Velocity */}
      <motion.div
        style={!isTouchDevice && !reducedMotion ? { x: layer1X, y: layer1Y } : undefined}
        animate={!reducedMotion ? { y: [0, -9, 0] } : undefined}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        className="hidden xl:flex absolute top-12 left-10 w-72 flex-col gap-2.5 p-4 rounded-2xl bg-[#090D1A]/70 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] pointer-events-none z-0 select-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold flex items-center gap-1.5">
            <Activity size={12} className="text-cyan-400" />
            Financial Matrix
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-medium text-emerald-300">
            <TrendingUp size={10} />
            +24.8%
          </span>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-medium">Monthly Inflow</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-extrabold text-white tracking-tight">GH₵ 84,250.00</span>
            <span className="text-[10px] text-slate-400">Settled</span>
          </div>
        </div>
        {/* Micro Sparkline */}
        <div className="h-7 w-full flex items-end gap-1 pt-1">
          {[35, 45, 30, 60, 50, 75, 70, 90, 85, 100].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className="flex-1 rounded-xs bg-gradient-to-t from-indigo-500/30 to-cyan-400/80"
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
          <span>Paystack Auto-Reconciliation</span>
          <span className="font-mono text-cyan-300">Live</span>
        </div>
      </motion.div>

      {/* 2. Top-Right: Active Client Retainer */}
      <motion.div
        style={!isTouchDevice && !reducedMotion ? { x: layer2X, y: layer2Y } : undefined}
        animate={!reducedMotion ? { y: [0, 8, 0] } : undefined}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="hidden xl:flex absolute top-16 right-12 w-68 flex-col gap-2.5 p-4 rounded-2xl bg-[#090D1A]/70 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] pointer-events-none z-0 select-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold flex items-center gap-1.5">
            <Layers size={12} className="text-indigo-400" />
            Active Sprint
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-medium text-indigo-300">
            Sprint 04
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-inner">
            AM
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-200 truncate">Ascent Media Global</p>
            <p className="text-[10px] text-slate-400">Brand Identity & Retainer</p>
          </div>
        </div>
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
            <span>Milestones Cleared</span>
            <span className="text-slate-200 font-bold">88%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
          </div>
        </div>
      </motion.div>

      {/* 3. Bottom-Left: Live Control Room Telemetry */}
      <motion.div
        style={!isTouchDevice && !reducedMotion ? { x: layer3X, y: layer3Y } : undefined}
        animate={!reducedMotion ? { y: [0, 7, 0] } : undefined}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="hidden xl:flex absolute bottom-14 left-14 w-72 flex-col gap-2 p-3.5 rounded-2xl bg-[#090D1A]/70 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] pointer-events-none z-0 select-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-mono tracking-wider text-slate-300 font-bold uppercase">
              Gateway Operational
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">14ms latency</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 text-[10px]">
          <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-slate-400 block">Security Layer</span>
            <span className="font-mono text-slate-200 font-medium">TLS 1.3 / mTLS</span>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-slate-400 block">Database</span>
            <span className="font-mono text-slate-200 font-medium">Synced • Active</span>
          </div>
        </div>
      </motion.div>

      {/* 4. Bottom-Right: Vault Delivery Token */}
      <motion.div
        style={!isTouchDevice && !reducedMotion ? { x: layer4X, y: layer4Y } : undefined}
        animate={!reducedMotion ? { y: [0, -8, 0] } : undefined}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="hidden xl:flex absolute bottom-12 right-16 w-68 flex-col gap-2.5 p-4 rounded-2xl bg-[#090D1A]/70 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] pointer-events-none z-0 select-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold flex items-center gap-1.5">
            <FolderDown size={12} className="text-violet-400" />
            Client Vault
          </span>
          <span className="text-[10px] font-mono text-violet-300">Protected</span>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
            <Radio size={14} />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-slate-200 truncate">Campaign_Final_4K.zip</p>
            <p className="text-[10px] text-slate-400">One-Time Token Ready • 2.4 GB</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
          <span>Release Protocol</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 size={10} /> Verified
          </span>
        </div>
      </motion.div>

      {/* ─── Main Elevated 3D Interactive Login Station ────────────────── */}
      <div className="w-full max-w-md z-10 relative">
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={
            !isTouchDevice && !reducedMotion
              ? {
                  perspective: 1200,
                  transformStyle: 'preserve-3d',
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                }
              : undefined
          }
          className="relative rounded-3xl overflow-hidden transition-shadow duration-300"
        >
          {/* Subtle Outer Glow Edge */}
          <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-b from-white/20 via-indigo-500/20 to-cyan-500/10 pointer-events-none" />

          {/* Interactive Mouse Spotlight Sheen on the Card */}
          {!isTouchDevice && !reducedMotion && (
            <div
              className="absolute inset-0 pointer-events-none z-30 transition-opacity duration-300"
              style={{
                background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(99, 102, 241, 0.12), transparent 70%)`,
              }}
            />
          )}

          {/* Card Body with Glassmorphic Obsidian Background */}
          <div className="relative rounded-[23px] bg-gradient-to-b from-[#0F1424]/95 via-[#0A0D18]/95 to-[#070912]/98 backdrop-blur-2xl p-7 sm:p-9 border border-white/[0.08] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_50px_rgba(99,102,241,0.06)] overflow-hidden">
            {/* Top Bevel Highlight */}
            <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            {/* Header: Futuristic Control Room Header (NO LOGO) */}
            <div className="text-center mb-7 relative">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono tracking-widest text-indigo-300 uppercase mb-3 shadow-inner">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CTRL ROOM • SECURE PORTAL
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Enter Control Room
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-xs mx-auto">
                Authenticate your workstation to access agency clients, operations, and delivery matrix.
              </p>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 mb-5 shadow-lg backdrop-blur-md"
                >
                  <AlertCircle size={17} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-rose-200 leading-snug">{authError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Station Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-400 transition-colors">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    placeholder="admin@lexmedia.com"
                    autoComplete="email"
                    disabled={isBusy}
                    {...register('email')}
                    className={`block w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm bg-black/40 text-white placeholder-slate-500 border transition-all duration-200 focus:outline-none ${
                      errors.email
                        ? 'border-rose-500/80 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-white/10 hover:border-white/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">{errors.email.message}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Security Passcode
                  </label>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-400 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    disabled={isBusy}
                    {...register('password')}
                    className={`block w-full rounded-xl pl-10 pr-10 py-2.5 text-sm bg-black/40 text-white placeholder-slate-500 border transition-all duration-200 focus:outline-none ${
                      errors.password
                        ? 'border-rose-500/80 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-white/10 hover:border-white/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">{errors.password.message}</p>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isBusy}
                    {...register('rememberMe')}
                    className="w-4 h-4 rounded bg-black/50 border-white/20 text-indigo-600 focus:ring-indigo-500/30 focus:ring-offset-0 focus:ring-1"
                  />
                  <span className="text-xs text-slate-400 hover:text-slate-300 transition-colors">
                    Remember workstation
                  </span>
                </label>
                <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-indigo-400" />
                  Encrypted
                </span>
              </div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={isBusy}
                whileHover={!isBusy ? { scale: 1.01, translateY: -1 } : undefined}
                whileTap={!isBusy ? { scale: 0.98 } : undefined}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-400 hover:via-indigo-500 hover:to-indigo-600 text-white font-semibold text-sm shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5)] border border-indigo-400/30 flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none mt-2 select-none"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Authenticating Station...
                  </span>
                ) : (
                  <>
                    <span>Authenticate Station</span>
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </motion.button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/[0.08]" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Or Continue With
              </span>
              <span className="h-px flex-1 bg-white/[0.08]" />
            </div>

            {/* Enhanced Google Sign-In Button */}
            <div>
              <motion.button
                type="button"
                disabled={isBusy}
                onClick={handleGoogleLogin}
                whileHover={!isBusy ? { scale: 1.01, translateY: -1 } : undefined}
                whileTap={!isBusy ? { scale: 0.98 } : undefined}
                className="w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] active:bg-white/[0.04] border border-white/[0.12] hover:border-white/25 text-slate-200 hover:text-white font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none select-none"
              >
                {!isGoogleLoading ? (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                    <path d="M1 1h22v22H1z" fill="none" />
                  </svg>
                ) : (
                  <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                )}
                <span>
                  {isGoogleLoading ? 'Authorizing Google Account...' : 'Sign in with Google Workspace'}
                </span>
              </motion.button>
            </div>

            {/* Footnote Notice */}
            <p className="text-center text-[11px] text-slate-500 mt-6 leading-relaxed">
              Authorized personnel only. All access requests are cryptographic,
              <br className="hidden sm:inline" /> validated against verified staff registries.
            </p>
          </div>
        </motion.div>

        {/* Status indicator bar beneath card */}
        <div className="mt-4 flex items-center justify-between px-2 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <Terminal size={12} className="text-slate-500" />
            NODE: ACCRA-01
          </span>
          <span className="text-slate-600">SECURE SHELL v2.4</span>
        </div>
      </div>

      {/* ─── Dashboard Entry Transition Overlay ────────────────────────── */}
      <AnimatePresence>
        {isEntering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070E]/90 backdrop-blur-2xl text-white"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-4 text-center max-w-xs"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 p-0.5 shadow-[0_0_50px_rgba(79,70,229,0.8)]">
                  <div className="w-full h-full bg-[#080B15] rounded-[14px] flex items-center justify-center text-cyan-400">
                    <Cpu size={28} className="animate-pulse" />
                  </div>
                </div>
                <div className="absolute -inset-2 rounded-3xl bg-cyan-400/20 blur-xl animate-ping opacity-50" />
              </div>

              <div>
                <p className="text-xs font-mono tracking-widest text-cyan-400 uppercase font-bold">
                  ACCESS GRANTED
                </p>
                <h3 className="text-xl font-bold text-white mt-1">Entering Ctrl Room</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Synchronizing operations and loading dashboard matrix...
                </p>
              </div>

              {/* Progress Sweep Bar */}
              <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden mt-2">
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }}
                  className="h-full w-1/2 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#060811] text-indigo-400">
          <div className="flex flex-col items-center gap-3">
            <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono tracking-widest text-slate-400 uppercase">
              Initializing Secure Terminal...
            </span>
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  )
}
