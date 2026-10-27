'use client';

/**
 * TextSplit: Splits text into words and letters for letter-by-letter GSAP animation.
 * Accessible: Uses aria-label on the wrapper and aria-hidden on split characters
 * to avoid duplicate screen-reader announcements.
 */
export default function TextSplit({ text, className = '', letterClassName = 'char' }) {
  if (!text) return null;

  // Split into words so spaces don't collapse or break awkwardly
  const words = text.split(' ');

  return (
    <span className={className} aria-label={text} style={{ display: 'inline-block' }}>
      {words.map((word, wordIndex) => (
        <span
          key={wordIndex}
          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
          aria-hidden="true"
        >
          {word.split('').map((char, charIndex) => (
            <span
              key={charIndex}
              className={letterClassName}
              style={{
                display: 'inline-block',
                willChange: 'transform, opacity',
              }}
            >
              {char}
            </span>
          ))}
          {/* Preserve space between words */}
          {wordIndex < words.length - 1 && (
            <span style={{ display: 'inline-block', width: '0.28em' }}>&nbsp;</span>
          )}
        </span>
      ))}
    </span>
  );
}
