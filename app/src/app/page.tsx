import Image from "next/image";
import SafaqatLanding from "./SafaqatLanding";
import styles from "./startup.module.css";

export default function Page() {
  return (
    <div className={styles.startup}>
      <div className={styles.splash} aria-hidden="true">
        <div className={styles.mark} lang="ar" dir="rtl">
          <Image
            src="/images/safaqat-luminous-v4.webp"
            alt=""
            width={690}
            height={720}
            unoptimized
            preload
          />
          <p className={styles.tagline}>سوقك الذكي لكل طلباتك</p>
        </div>
      </div>
      <div className={styles.landing}>
        <SafaqatLanding />
      </div>
    </div>
  );
}
