const STARS = [
  [8, 12, 1.2, 0],
  [18, 28, 0.8, 0.6],
  [32, 8, 1.4, 1.1],
  [44, 22, 0.7, 0.3],
  [58, 14, 1.1, 1.8],
  [72, 9, 0.9, 0.4],
  [86, 18, 1.3, 1.4],
  [12, 42, 0.6, 2.1],
  [28, 36, 1, 0.9],
  [51, 40, 0.7, 1.6],
  [67, 33, 1.2, 0.2],
  [81, 44, 0.8, 2.4],
  [6, 62, 0.9, 1.2],
  [22, 70, 0.6, 0.5],
  [39, 58, 1.1, 1.9],
  [63, 66, 0.7, 0.8],
  [78, 58, 1, 2.2],
  [91, 72, 0.8, 1.3],
  [15, 84, 0.5, 0.1],
  [48, 78, 0.9, 1.7],
  [74, 82, 0.6, 0.7],
  [93, 36, 0.5, 2.6],
];

export function Starfield() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {STARS.map(([x, y, s, delay], i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: s,
            height: s,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}
