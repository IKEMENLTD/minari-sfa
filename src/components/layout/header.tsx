import { User } from 'lucide-react';

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center gap-2 pl-10 md:hidden">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
          <span className="text-[10px] font-bold text-white">IC</span>
        </div>
        <span className="text-sm font-semibold text-text tracking-tight uppercase">
          Interconnect
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
        <User className="h-4 w-4" />
        <span>森井</span>
      </div>
    </header>
  );
}

export { Header };
