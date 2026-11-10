// The Hinokami wordmark, split like SoMi's: "Hi" (fire) in the accent, the rest in ink.

export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      <span className="text-accent">Hi</span>nokami
    </span>
  );
}
