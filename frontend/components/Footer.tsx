import Link from "next/link";

import { NewsletterSignup } from "@/components/NewsletterSignup";

export function Footer() {
  return (
    <footer className="bg-brand-navy text-gray-300">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="text-lg font-bold text-white">Showfloor</p>
            <p className="mt-2 max-w-sm text-sm text-gray-400">
              The marketplace for card shows and dealers &mdash; find vendors, browse
              inventory, and connect directly with the people running the show.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/vendors" className="hover:text-white">
                  Browse Vendors
                </Link>
              </li>
              <li>
                <Link href="/cards" className="hover:text-white">
                  Browse Cards
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white">
                  My Account
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-white">
                  Create an account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/work-with-us" className="hover:text-white">
                  Work With Us
                </Link>
              </li>
              <li>
                <a href="mailto:hello@showfloor.example.com" className="hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-800 pt-8">
          <p className="text-sm font-semibold text-white">Get show updates</p>
          <p className="mt-1 mb-3 text-sm text-gray-400">
            New shows, featured vendors, and inventory drops &mdash; no spam.
          </p>
          <NewsletterSignup />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-gray-800 pt-6 text-xs text-gray-500">
          <p>&copy; 2026 Showfloor. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/perfect-game-white.png" alt="Perfect Game" className="h-5 w-auto" />
          </div>
        </div>
      </div>
    </footer>
  );
}
