import Link from 'next/link';
import Button from '@/components/common/Button';
import styles from './Navbar.module.css';

export default function Navbar() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          AZURE COVE RESORT
        </Link>
        <nav className={styles.nav}>
          <Link href="#accommodations" className={styles.navLink}>
            Accommodations
          </Link>
          <Link href="#amenities" className={styles.navLink}>
            Amenities
          </Link>
          <Link href="#experiences" className={styles.navLink}>
            Experiences
          </Link>
          <Button variant="primary">Book Stay</Button>
        </nav>
      </div>
    </header>
  );
}
