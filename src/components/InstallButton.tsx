import { useEffect, useState } from 'react';
import { Icon } from './Icon';
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function InstallButton() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const listener = (value: Event) => {
      value.preventDefault();
      setEvent(value as InstallEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', listener);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', listener);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!event) return null;
  return (
    <button
      className="nav-install"
      onClick={() => {
        void event
          .prompt()
          .then(() => event.userChoice)
          .then(() => setEvent(null));
      }}
    >
      <Icon name="download" />
      Install app
    </button>
  );
}
