import { redirect } from 'next/navigation';

// The app opens on the Dashboard.
export default function Home() {
  redirect('/dashboard');
}
