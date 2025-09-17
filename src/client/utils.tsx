// Setup Countdown
import { useEffect, useState } from 'react';

type CountdownProps = { targetTimestamp: number; };
export function Countdown({ targetTimestamp }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetTimestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(targetTimestamp));
    }, 1000);

    return () => clearInterval(interval); // cleanup on unmount
  }, [targetTimestamp]);

  if (timeLeft.total <= 0) {
    return <span>Countdown finished!</span>;
  }

  return (
    <div className="font-mono text-xs sm:text-sm lg:text-xl">
      {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s remaining
    </div>
  );
}

function getTimeLeft(target: number) {
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { total: diff, days, hours, minutes, seconds };
}
