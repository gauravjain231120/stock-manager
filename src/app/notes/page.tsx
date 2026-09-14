import { listNotes } from '@/lib/notes';
import { NotesPanel } from '@/components/NotesPanel';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const notes = await listNotes();

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <NotesPanel initialNotes={notes} />
    </main>
  );
}
