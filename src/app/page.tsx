import { redirect } from 'next/navigation';

// The app opens on the simple Stock Log.
export default function Home() {
  redirect('/register');
}
