const OPPORTUNITIES = [
  {
    title: "Vendor Success Manager",
    location: "Remote (US)",
    blurb: "Help new dealers get set up, list inventory, and get the most out of shows.",
  },
  {
    title: "Show Operations Coordinator",
    location: "Chicago, IL",
    blurb: "Work directly with venues and vendors to plan and run events on the ground.",
  },
  {
    title: "Frontend Engineer",
    location: "Remote (US)",
    blurb: "Build the marketplace experience collectors and dealers use every day.",
  },
];

export default function WorkWithUsPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Work With Us</h1>
        <p className="mt-3 max-w-xl text-gray-600 dark:text-gray-300">
          We&apos;re a small team building the marketplace for card shows and dealers. If
          you love the hobby and want to help grow it, we&apos;d love to hear from you.
        </p>

        <h2 className="mb-4 mt-10 text-xl font-semibold">Open roles</h2>
        <div className="space-y-4">
          {OPPORTUNITIES.map((role) => (
            <div
              key={role.title}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{role.title}</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">{role.location}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{role.blurb}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t see a fit but still want to reach out? Email us at{" "}
          <a
            href="mailto:careers@showfloor.example.com"
            className="font-medium text-brand-blue hover:underline"
          >
            careers@showfloor.example.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
