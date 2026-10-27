import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <h3>Azure Cove Resort & Spa</h3>
            <p>
              Experience an unparalleled coastal sanctuary where luxury meets serenity.
            </p>
          </div>
          <div className={styles.col}>
            <h4>Explore</h4>
            <ul className={styles.linkList}>
              <li><Link href="#accommodations">Suites & Villas</Link></li>
              <li><Link href="#dining">Fine Dining</Link></li>
              <li><Link href="#spa">Wellness Spa</Link></li>
              <li><Link href="#activities">Private Excursions</Link></li>
            </ul>
          </div>
          <div className={styles.col}>
            <h4>Contact</h4>
            <ul className={styles.linkList}>
              <li>Paradise Bay Rd, Oceanfront</li>
              <li>reservations@azurecoveresort.com</li>
              <li>+1 (800) 555-COVE</li>
            </ul>
          </div>
        </div>
        <div className={styles.copyright}>
          <p>&copy; {new Date().getFullYear()} Azure Cove Resort. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
