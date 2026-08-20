"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || "Something went wrong creating your account.");
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    setIsSubmitting(false);

    if (result?.error) {
      router.push("/login");
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
            <h2 className="text-3xl font-serif text-white mb-2">Request Access</h2>
            <p className="text-sm text-gray-400">Apply for your private account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-400 backdrop-blur-md">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="label-lux">FULL NAME</label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-lux"
                placeholder="Jane Doe"
              />
            </div>

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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-lux"
                placeholder="At least 8 characters"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-luxury-primary w-full mt-8"
            >
              {isSubmitting ? "Creating Account..." : "Submit Application"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[#d4af37] hover:text-[#f1dc8e] transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* Right Pane - Graphics */}
      <div className="relative hidden w-0 flex-1 lg:block overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-[#2e1065] via-[#06040C] to-[#06040C]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20 pointer-events-none" style={{ background: 'radial-gradient(circle, #d4af37 0%, transparent 60%)' }}></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
          <h2 className="text-4xl font-serif text-white mb-6">Join the <br/><span className="gold-text-shine italic">Elite Network</span></h2>
          <p className="text-gray-400 max-w-md font-light leading-relaxed">Membership provides direct access to high-yield opportunities, dedicated support, and institutional execution.</p>
        </div>
      </div>
    </div>
  );
}
