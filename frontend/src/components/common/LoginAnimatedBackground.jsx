const codingSymbols = ['</>', '{ }', '( )', '[ ]', '//', '#', '&&', 'fn()', '<div>', '=>']

export default function LoginAnimatedBackground({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.18),transparent_28%),linear-gradient(135deg,#020617_8%,#061224_48%,#0b1a31_100%)]" />
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
