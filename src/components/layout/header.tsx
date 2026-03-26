import { User } from 'lucide-react';

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <h1 className="text-lg font-semibold text-text md:hidden">
        森井システム
      </h1>
      <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>森井</span>
      </div>
    </header>
  );
}

export { Header };
