import { User } from 'lucide-react';
import { Logo } from './logo';

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <div className="pl-10 md:hidden">
        <Logo size={24} />
      </div>
      <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>森井</span>
      </div>
    </header>
  );
}

export { Header };
