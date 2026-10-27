import styles from './Button.module.css';

export default function Button({
  children,
  variant = 'primary',
  className = '',
  onClick,
  ...props
}) {
  const variantClass = styles[variant] || styles.primary;

  return (
    <button
      className={`${styles.button} ${variantClass} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
