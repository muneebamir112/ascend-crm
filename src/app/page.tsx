import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#06040C]">
      {/* Background ambient effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse, #d4af37 0%, transparent 60%)' }}></div>
      <div className="absolute top-40 -left-40 w-[600px] h-[600px] opacity-20 pointer-events-none" style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}></div>
      <div className="absolute -bottom-40 -right-40 w-[800px] h-[800px] opacity-15 pointer-events-none" style={{ background: 'radial-gradient(circle, #d4af37 0%, transparent 70%)' }}></div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-[#d4af37]/40 flex items-center justify-center transform rotate-45">
            <div className="w-6 h-6 bg-[#d4af37]/20 -rotate-45 flex items-center justify-center">
              <div className="w-2 h-2 bg-[#d4af37]"></div>
            </div>
          </div>
          <span className="font-serif text-xl tracking-[0.2em] font-semibold text-white">ASCEND</span>
        </div>
        
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm tracking-widest uppercase font-medium text-gray-300 hover:text-white transition-colors">
            {session ? "Dashboard" : "Sign In"}
          </Link>
          {!session && (
            <Link href="/register" className="btn-luxury-primary text-sm px-6 py-2.5">
              Apply Now
            </Link>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/5 backdrop-blur-md mb-8">
          <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse"></span>
          <span className="text-xs uppercase tracking-[0.2em] text-[#d4af37] font-semibold">The Tokenized Wealth Ecosystem</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-serif text-white mb-8 leading-tight">
          Private Concierge for the <br className="hidden md:block" />
          <span className="gold-text-shine italic font-light">Digital Economy</span>
        </h1>
        
        <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl font-light leading-relaxed">
          Unlock exclusive access to tokenized assets, private markets, and a global network of elite investors—all managed from a singular, unified platform.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Link href={session ? "/dashboard" : "/register"} className="btn-luxury-primary w-full sm:w-auto text-lg px-8 py-4">
            {session ? "Enter Dashboard" : "Request Access"}
          </Link>
          <Link href="/about" className="btn-luxury-ghost w-full sm:w-auto text-lg px-8 py-4">
            Discover Ascend
          </Link>
        </div>
      </main>

      {/* Stats Row */}
      <section className="relative z-10 border-y border-white/5 bg-black/20 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between divide-y md:divide-y-0 md:divide-x divide-white/5">
          <div className="flex-1 text-center py-6 md:py-0">
            <div className="stat-value text-4xl mb-2">$4.2B+</div>
            <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Assets Tokenized</div>
          </div>
          <div className="flex-1 text-center py-6 md:py-0">
            <div className="stat-value text-4xl mb-2">18,500</div>
            <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Global Members</div>
          </div>
          <div className="flex-1 text-center py-6 md:py-0">
            <div className="stat-value text-4xl mb-2">0.02s</div>
            <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Execution Latency</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-serif text-white mb-6">Unparalleled Access</h2>
          <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent mx-auto"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "Global Liquidity",
              desc: "Instant settlement across multiple chains with aggregated liquidity pools and institutional-grade security."
            },
            {
              title: "Private Markets",
              desc: "Gain exposure to exclusive pre-IPO equity, real estate, and fine art through fractional tokenization."
            },
            {
              title: "White-Glove Support",
              desc: "Dedicated account managers available 24/7 to handle OTC trades, tax reporting, and asset structuring."
            }
          ].map((feature, i) => (
            <div key={i} className="glass-card-gold p-8 group" style={{ position: 'relative' }}>
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#d4af37]/50 m-4"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-[#d4af37]/50 m-4"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#d4af37]/50 m-4"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#d4af37]/50 m-4"></div>
              
              <div className="w-12 h-12 mb-6 border border-[#d4af37]/30 flex items-center justify-center rounded-lg bg-black/40 group-hover:bg-[#d4af37]/10 transition-colors mx-auto md:mx-0">
                <div className="w-4 h-4 bg-[#d4af37]"></div>
              </div>
              <h3 className="text-xl font-serif text-white mb-4 text-center md:text-left">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed font-light text-center md:text-left">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
