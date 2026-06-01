const codingSymbols = ['</>', '{ }', '( )', '[ ]', '//', '#', '&&', 'fn()', '<div>', '=>']

export default function LoginAnimatedBackground({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(41,82,255,0.24),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,79,163,0.22),transparent_30%),linear-gradient(135deg,#0A0F1E_8%,#111A35_50%,#1E1230_100%)]" />
      <div className="login-neon-dots absolute inset-0">
        {Array.from({ length: 14 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="login-neon-dots login-neon-dots--pulse absolute inset-0">
        {Array.from({ length: 10 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="login-code-symbols absolute inset-0">
        {codingSymbols.map((symbol, index) => (
          <span key={`${symbol}-${index}`}>{symbol}</span>
        ))}
      </div>
    </div>
  )
}
