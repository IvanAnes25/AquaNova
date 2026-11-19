import oceanBackground from '../assets/ocean-home-background.png';
import Icon from './Icon.jsx';

export default function HeroSection({ shopStatus, statusError }) {
  const statusText = statusError
    ? 'Shop status unavailable. Please try again later.'
    : shopStatus?.statusLine || 'Checking shop status…';
  return (
    <section className="home-hero">
      <img
        className="home-hero-background"
        src={oceanBackground}
        alt="Illustration of fish swimming through a bright blue underwater reef"
        fetchPriority="high"
      />
      <div className="home-hero-overlay" />
      <div className="home-hero-inner">
        <div className="home-hero-content">
          <h1>
            Dive into the world of aquatic wonders at
            <span> Nasugbu Aquatica!</span>
          </h1>
          <p className="home-hero-description">
            Our pet store is dedicated to providing top-quality aquatic animals, cutting-edge equipment, and personalized guidance to ensure a healthy and happy aquatic environment.
          </p>

          <p className="home-hero-shop-status" role="status" aria-live="polite">
            {statusText}
          </p>

          <div className="home-hero-actions">
            <a className="home-hero-primary" href="#shop">
              Find your next favourite
              <Icon name="arrow" className="h-4 w-4" />
            </a>
            <a className="home-hero-secondary" href="#visit-us">
              Visit us
            </a>
          </div>
        </div>

        <div className="home-hero-details-viewport">
          <div className="home-hero-details">
            <div className="home-hero-details-group">
              <div>
                <Icon name="location" className="h-4 w-4" />
                <span>YOUR LOCAL AQUARIUM SHOP</span>
              </div>
              <span className="home-hero-detail-divider" />
              <div>
                <span className="home-hero-open-dot" />
                <span>FRIENDLY IN-STORE ADVICE</span>
              </div>
              <span className="home-hero-detail-divider" />
              <div>
                <span>NASUGBU · BATANGAS</span>
              </div>
            </div>
            <div className="home-hero-details-group" aria-hidden="true">
              <div>
                <Icon name="location" className="h-4 w-4" />
                <span>YOUR LOCAL AQUARIUM SHOP</span>
              </div>
              <span className="home-hero-detail-divider" />
              <div>
                <span className="home-hero-open-dot" />
                <span>FRIENDLY IN-STORE ADVICE</span>
              </div>
              <span className="home-hero-detail-divider" />
              <div>
                <span>NASUGBU · BATANGAS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
