import logoImage from '../assets/nasugbu-aquatica-logo.png';
import Icon from './Icon.jsx';
import { shopHoursRows } from '../lib/shopHours.js';

const directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=Nasugbu+Aquatica%2C+Nasugbu%2C+Batangas';

const exploreLinks = [
  ['Home', '#top'],
  ['Shop', '#shop'],
  ['Our story', '#our-story'],
  ['Visit us', '#visit-us'],
  ['FAQ', '#faq'],
];

export default function SiteFooter({ settings }) {
  const openingHours = shopHoursRows(settings?.shopHours);
  return (
    <footer className="site-footer">
      <div className="site-footer-main">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <a aria-label="Nasugbu Aquatica home" className="site-footer-logo" href="#top">
              <img alt="" src={logoImage} />
              <span>Nasugbu Aquatica</span>
            </a>
            <p>Thoughtful care for every little underwater world.</p>
            <a className="site-footer-email" href="mailto:anesivan21@gmail.com">
              <Icon name="mail" />
              anesivan21@gmail.com
            </a>
          </div>

          <nav aria-label="Footer navigation" className="site-footer-links">
            <h2>Explore</h2>
            {exploreLinks.map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </nav>

          <div className="site-footer-visit">
            <h2>Visit the shop</h2>
            <p>Nasugbu, Batangas, Philippines</p>
            <a href={directionsUrl} rel="noreferrer" target="_blank">
              Get directions <Icon name="arrow" />
            </a>
          </div>

          <div className="site-footer-hours">
            <h2>Opening hours</h2>
            {openingHours
              ? openingHours.map(([day, hours]) => <p key={day}><span>{day}</span><span>{hours}</span></p>)
              : <p role="status">Opening hours unavailable.</p>}
            <a className="site-footer-contact" href="#contact">Questions? Contact us</a>
          </div>
        </div>
      </div>

      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} Nasugbu Aquatica. All rights reserved.</p>
        <a href="#top">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  );
}
