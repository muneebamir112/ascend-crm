"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-[#06040C]">
      {/* Left Pane - Form */}
      <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-12 lg:flex-none lg:w-[40%] xl:px-24 z-10">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-10">
            <Link href="/" className="inline-flex items-center gap-3 mb-12 group">
              <div className="w-8 h-8 border border-[#d4af37]/40 flex items-center justify-center transform rotate-45 group-hover:border-[#d4af37]/80 transition-colors">
                <div className="w-4 h-4 bg-[#d4af37]/20 -rotate-45 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-[#d4af37]"></div>
                </div>
              </div>
              <span className="font-serif text-lg tracking-[0.2em] font-semibold text-white">ASCEND</span>
            </Link>
            <h2 className="text-3xl font-serif text-white mb-2">Welcome Back</h2>
            <p className="text-sm text-gray-400">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-400 backdrop-blur-md">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label-lux">EMAIL ADDRESS</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-lux"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="label-lux">PASSWORD</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-lux"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-luxury-primary w-full mt-8"
            >
              {isSubmitting ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-[#d4af37] hover:text-[#f1dc8e] transition-colors">
              Apply for access
            </Link>
          </p>
        </div>
      </div>

      {/* Right Pane - Graphics */}
      <div className="relative hidden w-0 flex-1 lg:block overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#2e1065] via-[#06040C] to-[#06040C]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20 pointer-events-none" style={{ background: 'radial-gradient(circle, #d4af37 0%, transparent 60%)' }}></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
          <h2 className="text-4xl font-serif text-white mb-6">Private Concierge for the <br/><span className="gold-text-shine italic">Tokenized Economy</span></h2>
          <p className="text-gray-400 max-w-md font-light leading-relaxed">Experience unprecedented access to global liquidity and private markets, secured by institutional-grade infrastructure.</p>
        </div>
      </div>
    </div>
  );
}
