import { VendorDirectory } from "./VendorDirectory";

export default function VendorsPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Browse Vendors</h1>
        <p className="mb-8 text-gray-600 dark:text-gray-300">
          {"Find dealers by specialty, then browse their inventory."}
        </p>
        <VendorDirectory />
      </div>
    </main>
  );
}
