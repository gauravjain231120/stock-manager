// Where an authenticated account with no granted sections lands, instead of
// bouncing back to the login form (confusing — they ARE logged in) or a raw
// 403. Reachable regardless of role/sections (see NO_ACCESS_PATH in
// lib/permissions.ts) so it can never itself be the thing that's blocked.
export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">No sections assigned yet</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your account is logged in, but doesn&apos;t have access to anything yet. Ask an Owner to grant you some
          sections from the Team page.
        </p>
      </div>
    </main>
  );
}
