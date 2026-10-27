import styles from './CategoryCard.module.css';

/**
 * CategoryCard: Visual placeholder card component for upcoming category pages.
 * Displays category title, description, icon, and 'Coming Soon' placeholder badge.
 */
export default function CategoryCard({
  badge = 'COMING SOON',
  icon = '✦',
  title,
  description,
  className = '',
}) {
  return (
    <div className={`${styles.card} ${className}`}>
      <div className={styles.cardTopRow}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
