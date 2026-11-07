import { useEffect, useRef, useState } from 'react';
import './DonationRollingCounter.css';

const formatAmount = (cents) => (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DonationRollingCounter = ({ cents }) => {
  const previous = useRef(cents);
  const [roll, setRoll] = useState({ from: cents, to: cents });
  useEffect(() => {
    setRoll({ from: previous.current, to: cents });
    previous.current = cents;
  }, [cents]);
  const next = formatAmount(roll.to);
  const old = formatAmount(roll.from).padStart(next.length, ' ');
  const increasing = roll.to > roll.from;

  return (
    <div role="img" aria-label={`Confirmed donations CAD $${formatAmount(cents)}`} className="donation-odometer">
      <span aria-hidden="true" className="donation-odometer-currency">$</span>
      <span aria-hidden="true" className="donation-odometer-digits">
        {next.split('').map((character, index) => {
          const digit = /\d/.test(character);
          const animate = digit && increasing && old[index] !== character;
          return digit ? (
            <span key={`${next.length}-${index}`} className="donation-odometer-window">
              <span key={`${roll.to}-${index}`} className={`donation-odometer-reel ${animate ? 'donation-odometer-roll' : ''}`}>
                {animate ? <span>{old[index]?.trim() || '0'}</span> : null}
                <span>{character}</span>
              </span>
            </span>
          ) : <span key={`${next.length}-${index}`} className="donation-odometer-separator">{character}</span>;
        })}
      </span>
    </div>
  );
};

export default DonationRollingCounter;