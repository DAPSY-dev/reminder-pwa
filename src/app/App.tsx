import { useSession } from '../hooks/useSession';
import { AppRoutes } from '../routes/AppRoutes';
export function App() {
  useSession();
  return <AppRoutes />;
}
