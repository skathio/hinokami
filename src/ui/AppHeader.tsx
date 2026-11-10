// Slim top bar shared by the setup screens: wordmark on the left, theme toggle on the right.

import Wordmark from './Wordmark';
import ThemeToggle from './ThemeToggle';

export default function AppHeader() {
  return (
    <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-3">
      <Wordmark className="text-2xl" />
      <ThemeToggle />
    </header>
  );
}
