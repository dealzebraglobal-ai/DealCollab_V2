import { redirect } from 'next/navigation';

export default function HomePage() {
  // DealCollab.org is the application domain. The public marketing website is dealcollab.in.
  // Therefore, the root of the application domain should direct users to sign in.
  redirect('/login');
}
