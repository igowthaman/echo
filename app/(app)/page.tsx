import { requireUser } from '@/lib/auth/current-user';
import Home from './home';

export default async function HomePage() {
  const user = await requireUser();
  return <Home username={user.username} displayName={user.displayName} />;
}
